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

// reddis connection - pull in rules for responding
client.on('connect', function(){
    console.log(`[SUCCESS] > Reddis Connected: ${process.env.REDIS}`);
    console.log(`[SUCCESS] > SQL DB: ${process.env.ARDI_DB}`);
    //load rules for responding
});
// start the webhook
app.listen(3053, () => console.log(`[SUCCESS] [Ardi RESPOND ${env.VER}] Webhook is listening`));

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
    loadRules();
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

//load rules on each call, so rules can be changed dynamically
function loadRules(){
    client.smembers('rules', function(err, results){
        if (err) console.error(err);
        for (var ri=0;results.length>ri;ri++){
            client.get(results[ri], function(err, result){
                let rule = new RuleEngine.Rule(result);
                engine.addRule(rule);
            })
        }
    })
}
//remove rules after each respond
function removeRules(){
    engine.rules.forEach((rule, idx) => {
        delete engine.rules[idx];
        engine.prioritizedRules = null;
    })
}

function beginRespond(uuid){
    client.hgetall(uuid, async function(err, results){ //getting message codes from redis
        var codes = results.code.split(',');
        var sCode = results.code.split('-');
        if (codes.includes('P-T')){ //if the code has a target, we need to validate if we should respond (ex. everyone)
            var resp_tgt = await respondTarget(uuid);
            //adding code 'XJ' as a placeholder for the need to respond.
            if (resp_tgt) codes.push('P');
        }
        var facts = { code: codes, id: results.cid };
        //running code against the rules engine
        engine.run(facts).then(function(success){
            success.events.forEach(async (item) => {
                var statusCheck = false;
                if (item.type === 'respond-Status') statusCheck = true;
                var action = item.params.action;
                var rply = await buildResponce(action, statusCheck);
                notify(rply, results.cid);
                
            })
            removeRules();
        })
         
    })
}

//function to determine if we should respond. 
function respondTarget(uuid){
    return new Promise((resolve, reject) => {
        client.smembers('response_targets', function(err, results){
            if (err) console.error(err);
            var sql = "SELECT data FROM codes WHERE code='P-T' AND uuid='" + uuid + "'";
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

function buildResponce(rCode, statusCheck){
    return new Promise (async (resolve, reject)=>{
        if (statusCheck) {
            var getStatusRslt = await getStatus();
                if (getStatusRslt){
                    var sql = "SELECT top_pos FROM code_stats WHERE code='" + rCode + "'"
                } else {
                    var sql = "SELECT top_pos FROM code_stats WHERE code='I-NR-PR-R'"
                    rCode = 'I-NR-PR-R'
                }
        } else{
            var sql = "SELECT top_pos FROM code_stats WHERE code='" + rCode + "'";
        }
        var reply = [];
        sqlQuery(sql, async function(err, results){
            if (err) console.error(err);
            if (results !== null && results[0] !== undefined){
                var pos = results[0].top_pos;
                var posArr = pos.split(',');
                for (var xg=0;posArr.length>xg;xg++){

                    var wrd = await getRspWord(rCode, posArr[xg], xg);
                    if (wrd !== null) reply.push(wrd);
                }
                var respStr = reply.join(' ');
                return resolve(respStr);
            }
            else { return resolve(null) }
        })
    })
}

function getRspWord(rCode, pos, xg){
    return new Promise((resolve, reject) => {
        var posSql = "SELECT word, pos, pos_position, pos_occurance FROM pos_stats WHERE code='" + rCode + "' AND pos='" + pos + "' AND pos_position='" + xg + "' ORDER BY pos_occurance DESC LIMIT 1"
        sqlQuery(posSql, function(err, result){
            if (err) console.err(err);
            if (result !== null && result[0] !== undefined) return resolve(result[0].word)
            return resolve(null);
        })
    })
}

async function getStatus(){
    return new Promise(async (resolve, reject) => {
        try {
            var discord = await axios.get(process.env.DISCORD + process.env.TOKEN);
        } catch {
            console.error('[ERROR] > ARDI DISCORD IS OFFLINE!');
            var discord = [];
            discord['status'] = 401
        }
        try {
            var sort = await axios.get(process.env.SORT + process.env.TOKEN);
        } catch{
            console.error('[ERROR] > ARDI SORT IS OFFLINE!');
            var sort = [];
            sort['status'] = 401
        }
        try{
            var classify = await axios.get(process.env.CLASSIFY + process.env.TOKEN);
        } catch {
            console.error('[ERROR] > ARDI CLASSIFY IS OFFLINE!');
            var classify = [];
            classify['status'] = 401
        }
        try {
            var processApp = await axios.get(process.env.PROCESS + process.env.TOKEN);
        } catch(error){
            console.error('[ERROR] > ARDI PROCESS IS OFFLINE!');
            var processApp = [];
            processApp['status'] = 401;
        }
        console.log('DISCORD:', discord.status, 'SORT:', sort.status, 'CLASSIFY:', classify.status, 'PROCESS:', processApp.status);
        if (discord.status === 200 && sort.status === 200 && classify.status === 200 && processApp.status === 200){
            return resolve(true);
        } else{ return resolve(false); }
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

