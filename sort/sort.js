//data sorting application
'use strict';
require('dotenv').config();
var mysql = require('mysql');
const express = require('express');
const bodyParser = require('body-parser');
const guid = require('uuid');
const app = express().use(bodyParser.json()); // creates http server
const axios = require('axios');
var crypto = require('crypto');
const env = process.env;
var token = process.env.TOKEN;
var redis = require('redis');
var client = redis.createClient(6379, env.REDIS); //creates a new client
var timestamp = new Date();

// start the webhook
app.listen(3051, () => console.log(`[SUCCESS] [Ardi SORT ${env.VER}] Webhook is listening`));

client.on('connect', function(){
    console.log(`[SUCCESS] > Reddis Connected: ${process.env.REDIS}`);
    console.log(`[SUCCESS] > SQL DB: ${process.env.ARDI_DB}`);
});


//l1db01 mySQL
var writePool = mysql.createPool({
    host: env.SQL_HOST,
    user: env.ARDI_USER,
    password: env.ARDI_PW,
    database: env.ARDI_DB
});
  
app.get('/', (req, res) => {
    // check if verification token is correct
    if (req.query.token !== token) {
        return res.sendStatus(401);
    } 
    // return challenge
    return res.end(req.query.challenge);
});

app.post('/', (req, res) => {
    // check if verification token is correct
    if (req.query.token !== token) {
        console.log(req.query);
        console.log('401');
        return res.sendStatus(401);
    }
    
    if (req.body.headers.action === 'message'){
        var sender = req.body.headers.author;
        console.log('[SUCCESS] Message received:', sender);
        var uuid = guid.v4.call();
        var message = req.body.headers.data;
        var userid = req.body.headers.userid;
        var refinedMessage = message.replace(/<.*>/, '');
        var cid = req.body.headers.channel;
        var date = timestamp.getTime();
        var sql = "INSERT INTO lang (data, uuid, guid, cid) VALUES (" + mysql.escape(refinedMessage) + ", " + mysql.escape(uuid) + ", " + mysql.escape(userid) + ", " + mysql.escape(req.body.headers.channel) + ")";
        sqlStore(sql);
        notify(message, uuid)
        client.hset(uuid, 'message', refinedMessage, 'guid', userid, 'cid', cid, 'timestamp', date);
        client.expire(uuid, 30);
    }
    if (req.body.headers.action === 'block'){
        var uuid = guid.v4.call();
        var sender = req.body.headers.author;
        var userID = req.body.headers.userid;
        var sql = "INSERT INTO user_ignore (user, userid) VALUES (" + mysql.escape(sender) + ", " + mysql.escape(userID) + ")";
        sqlStore(sql);
        client.rpush(['blocked_user', userID]);
        console.log('[ALERT] User blocked:', sender, userID);
    }
    if (req.body.headers.action === 'unblock'){
        var uuid = guid.v4.call();
        var sender = req.body.headers.author;
        var userID = req.body.headers.userid;
        var sql = "DELETE FROM user_ignore WHERE userid='" + userID + "'";
        sqlStore(sql);
        client.lrem(['blocked_user', -1, userID]);
        console.log('[SUCCESS] User unblocked:', sender, userID);
    }

    if (req.body.headers.action === 'update'){
        var stmt = req.body.headers.type;
        var uid = req.body.headers.id;
        var sql = "UPDATE lang  SET verified=1, class='" + stmt + "' WHERE uuid='" + uid + "'";
        sqlStore(sql);
    }

    


// return a text response
    const data = {
        responses: [
        {
            type: 'text',
            elements: ['Status', 'Received']
        }]
    };

    res.json(data);
});



//function to store sql information
function sqlStore(sql){
    writePool.getConnection(function(err, connection) {
        connection.query(sql, function(err){
            if (err) throw err;
        });
        connection.release();
    })
}

//API call to the process app to process data input.
function notify(data, uuid){
    axios.post(process.env.CLASSIFY + token, {
        headers: {
        action: "language",
        id: uuid,
        text: data,
        }
    })
    .catch(error => {
        console.error(error)
    });
}