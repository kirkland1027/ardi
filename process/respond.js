//data sorting application
'use strict';
require('dotenv').config();
var redis = require('redis');
const natural = require('natural');
var http = require("http");
const stemmer = natural.PorterStemmer;
var mysql = require('mysql');
const express = require('express');
const bodyParser = require('body-parser');
const sentenceTokenizer = new natural.SentenceTokenizer();
const wordTokenizer = new natural.WordTokenizer();
const app = express().use(bodyParser.json()); // creates http server
const axios = require('axios');
var NGrams = natural.NGrams;
const env = process.env;
var token = env.TOKEN;

var client = redis.createClient(6379, env.REDIS); //creates a new client
//var messages = redis.createClient(6379, env.REDIS); //creates a new client

client.on('connect', function(){
    console.log(`[SUCCESS] > Reddis Connected: ${process.env.REDIS}`);
    console.log(`[SUCCESS] > SQL DB: ${process.env.ARDI_DB}`);
});


const language = "EN"
const defaultCategory = 'N';
const defaultCategoryCapitalized = 'NNP';

// start the webhook
app.listen(3053, () => console.log(`[SUCCESS] [Ardi PROCESS ${env.VER}] Webhook is listening`));

//l1db01 mySQL
var sqlPool = mysql.createPool({
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

    var uuid = req.body.headers.id;
    client.hgetall(uuid, async function(err, results){
        var codes = results.code.split(',');
        //checking if we should respond to this.
        if (codes.includes('T')){
            var resp_tgt = await respondTarget(uuid);
        }
        
        if (codes.includes('P') || resp_tgt === true){
            //send basic responce
            var reply = await respond(codes, uuid);
            notify(reply, results.cid);
        }
    })

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







//function to store sql information
function sqlStore(sql){
    sqlPool.getConnection(function(err, connection) {
        connection.query(sql, function(err){
            if (err) throw err;
        });
        connection.release();
    })
}

function sqlQuery(sql, callback) {
    sqlPool.getConnection((err, connection) => {
      if (err) {
          console.log(err);
          connection.release();
          callback(err.code, null);
      }
      connection.query(sql,  (err, results) => {
          connection.release();
          if (!err) {
              callback(null, results);
          }
          else {
              callback(err.code, null);
          }
      });
  });
}

//notify discord app of response. 
function notify(response, channel){
    axios.post(process.env.DISCORD + token, {
        headers: {
        action: "reply",
        data: response,
        target: channel
        }
    })
    .catch(error => {
        console.error(error)
    });
    
}

//function to determine if we should respond. 
function respondTarget(uuid){
    //for (var i=0;results.length>i;i++)
    return new Promise((resolve, reject) => {
        client.smembers('response_targets', function(err, results){
            if (err) console.error(err);
            var sql = "SELECT data FROM codes WHERE code='T' AND uuid='" + uuid + "'";
            sqlQuery(sql, function(err, responces){
                if (err) console.error(err);
                for (var i=0;responces.length>i;i++){
                    if (results.includes(responces[i].data)){
                        return resolve(true);
                    }
                }
                return resolve(false);
            })
        })
    })
    
}

//building a response
function respond(codes, uuid){
    return new Promise(async (resolve, reject) => {
        var respArr = [];
        if (codes.includes('Q') || codes.includes('S')){
            // var rsCode = ['self', 'PS'];
            var rsCode = ['self', 'S', 'RQ', 'ST'];
            for (var i=0;rsCode.length>i;i++){
                if (rsCode[i] === 'S'){
                    var status = await getStatus();
                    if (status === true){
                        var word = await getWords('PS');
                        respArr.push(word);
                        console.log('word', word)
                    }
                    else{
                        var word = await getWords('NS');
                        respArr.push(word);
                    }
                } else{
                    var word = await getWords(rsCode[i]);
                    respArr.push(word);
                }
                
                
            }
            console.log(respArr)
            var respStr = respArr.join(' ');
            return resolve(respStr);
        }
    })
}

//getting the words for the response
function getWords(id){
    return new Promise((resolve, reject) => {
        client.lrange(id, 0, -1, function(err, results){
            if (results.length>1){
                for (var i=0;results.length>i;i++){
                    return resolve(results[0])
                }
            }
            else{
                return resolve(results);
            }
        })

    })
}

async function getStatus(){
    return new Promise(async (resolve, reject) => {
        var discord = await axios.get(process.env.DISCORD + process.env.TOKEN);
        var sort = await axios.get(process.env.SORT + process.env.TOKEN);
        var classify = await axios.get(process.env.CLASSIFY + process.env.TOKEN);
        console.log('DISCORD:', discord.status, 'SORT:', sort.status, 'CLASSIFY:', classify.status);
        if (discord.status === 200 && sort.status === 200 && classify.status === 200){
            return resolve(true);
        } else{ return resolve(false); }
    })
}

