//data sorting application
'use strict';
require('dotenv').config();
const redis = require('redis');
const natural = require('natural');
const mysql = require('mysql');
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
let RuleEngine = require('json-rules-engine');
let engine = new RuleEngine.Engine();
const stemmer = natural.PorterStemmer;
const sentenceTokenizer = new natural.SentenceTokenizer();
const wordTokenizer = new natural.WordTokenizer();
const app = express().use(bodyParser.json()); // creates http server
const env = process.env;
var NGrams = natural.NGrams;
var token = env.TOKEN;
var client = redis.createClient(6379, env.REDIS); //creates a new client

client.on('connect', function(){
    console.log(`[SUCCESS] > Reddis Connected: ${process.env.REDIS}`);
    console.log(`[SUCCESS] > SQL DB: ${process.env.ARDI_DB}`);

    //load rules
    client.smembers('rules', function(err, results){
        if (err) console.error(err);
        for (var ri=0;results.length>ri;ri++){
            client.get(results[ri], function(err, result){
                //var rule = result.toJSON();
                let rule = new RuleEngine.Rule(result);
                engine.addRule(rule);
            })
        }
    })
});
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
    beginRespond(uuid);
    

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

function beginRespond(uuid){
    client.hgetall(uuid, async function(err, results){
        var codes = results.code.split(',');
        //checking if we should respond to this.
        if (codes.includes('T')){
            var resp_tgt = await respondTarget(uuid);
            if (resp_tgt) codes.push('XJ');
        }
        var facts = { code: codes, id: results.cid };
        engine.run(facts).then(function(success){
            success.events.forEach(async (item) => {
                var action = item.params.action;
                var reply = await respond(codes, uuid, action);
                notify(reply, results.cid)
            })
             
        })
         
    })
}

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
function respond(codes, uuid, action){
    return new Promise(async (resolve, reject) => {
        var respArr = [];
        if (codes.includes('Q')){
            var rsCode = ['self', 'PS'];
            var rsCode = ['self', 'S', 'Q', 'ST'];
            for (var i=0;rsCode.length>i;i++){
                if (rsCode[i] === 'S'){
                    var status = await getStatus();
                    if (status === true){
                        var word = await getWords('PR');
                        respArr.push(word);
                    }
                    else{
                        var word = await getWords('NS');
                        //respArr.push(word);
                    }
                } else{
                    var word = await getWords(rsCode[i]);
                    respArr.push(word);
                }            
            }
            var respStr = respArr.join(' ');
            return resolve(respStr);
        }
    })
}

function buildResponce(rCode){
    return new Promise (async (resolve, reject)=>{
        var sql = "SELECT ";
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

