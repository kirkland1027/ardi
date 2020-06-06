//data sorting application
'use strict';
require('dotenv').config();
var redis = require('redis');
const natural = require('natural');
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

var respRslt;

var client = redis.createClient(6379, env.REDIS); //creates a new client
//var messages = redis.createClient(6379, env.REDIS); //creates a new client

client.on('connect', function(){
    console.log(`[SUCCESS] > Reddis Connected: ${process.env.REDIS}`);
    console.log(`[SUCCESS] > SQL DB: ${process.env.ARDI_DB}`);
});

var sqlPool = mysql.createPool({
    host: env.SQL_HOST,
    user: env.ARDI_USER,
    password: env.ARDI_PW,
    database: env.ARDI_DB
});


const language = "EN"
const defaultCategory = 'N';
const defaultCategoryCapitalized = 'NNP';

// start the webhook
app.listen(3052, () => console.log(`[SUCCESS] [Ardi PROCESS ${env.VER}] Webhook is listening`));

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
    
    var sentence = req.body.headers.text;
    var uuid = req.body.headers.id;
    var words = [];
    var sentToken = [];
    sentToken = sentenceTokenizer.tokenize(sentence);
    
    words = wordTokenizer.tokenize(sentence);
    var lexicon = new natural.Lexicon(language, defaultCategory, defaultCategoryCapitalized);
    var ruleSet = new natural.RuleSet('EN');
    var tagger = new natural.BrillPOSTagger(lexicon, ruleSet);
    var twords = tagger.tag(words);
    var taggedWords = twords.taggedWords;
    var posTags = [];
    var tagWords = [];
    for (var xl=0;taggedWords.length>xl;xl++){
        var sql = "INSERT INTO pos (tag, word, pos, uuid) VALUES ('" + taggedWords[xl].tag + "', '" + taggedWords[xl].token + "', '" + xl + "', '" + uuid + "')"
        sqlStore(sql);
        posTags.push(taggedWords[xl].tag);
        tagWords.push(taggedWords[xl].token);
    }
    var posString = posTags.join(',');
    var wordString = tagWords.join(',');
    var posSql = "UPDATE lang SET pos='" + posString + "' WHERE uuid='" + uuid + "'";
    sqlStore(posSql);
    client.hset(uuid, 'pos', posString.toString());
    client.hset(uuid, 'words', wordString.toString());
    client.expire(uuid, 600);
    if (env.CONSOLE_LOG){ console.log(`[SUCCESS] > message POS: ${posString.toString()}`) }
    
    //getting the members of the "class list type from redis"
    client.smembers('codes', async function(err, results){
        if (err) console.error(err);
        var rslts=[];
        var codes=[];
        for (var i=0;results.length>i;i++){
            //sending classification types for results
            var rst = await getReddisCount(results[i], sentence);         
            if (rst !== null){
                for (var jh=0;rst.length>jh;jh++){
                    var sqlKey = "INSERT INTO codes (code, data, uuid) VALUES ('" + results[i] + "', '" + rst[jh] + "', '" + uuid + "')";
                    sqlStore(sqlKey);       
                }
                if (!codes.includes(results[i])){
                    codes.push(results[i]);
                }
            }
        }
        var code = codes.join(',');
        var sqlCode = "UPDATE lang SET code='" + code + "' WHERE uuid='" + uuid + "'";
        sqlStore(sqlCode);
        notify(uuid, sentence, code);
        client.hset(uuid, 'code', code.toString());
        client.expire(uuid, 600);
        if (env.CONSOLE_LOG){ console.log(`[SUCCESS] > message CODE: ${code}`) }
        if (code.includes('Q')){ //if the input is a question, store the string as a question.
            var sqlQ = "INSERT INTO q (data, pos, length) VALUES ('" + sentence + "', '" + posString + "', '" + codes.length + "')";
            sqlStore(sqlQ);
            processNotify(uuid, 'Q');
            var sqlPos = "SELECT * from pos WHERE uuid='" + uuid + "'";
            sqlQuery(sqlPos, function(err, results){
                if (err) console.error(err);
                for (var xi=0;results.length>xi;xi++){
                    var sqlQcode = "UPDATE pos SET code='Q' WHERE id='" + results[xi].id +"'";
                    sqlStore(sqlQcode);
                }
            }) 
        }
        if(code.includes('PR')){
            var sqlQ = "INSERT INTO pr (data, pos, length) VALUES ('" + sentence + "', '" + posString + "', '" + codes.length + "')";
            sqlStore(sqlQ);
            processNotify(uuid, 'PR');
            var sqlPos = "SELECT * from pos WHERE uuid='" + uuid + "'";
            sqlQuery(sqlPos, function(err, results){
                if (err) console.error(err);
                for (var xi=0;results.length>xi;xi++){
                    var sqlQcode = "UPDATE pos SET code='PR' WHERE id='" + results[xi].id +"'";
                    sqlStore(sqlQcode);
                }
            })
        }
        if(code.includes('NR')){
            var sqlQ = "INSERT INTO nr (data, pos, length) VALUES ('" + sentence + "', '" + posString + "', '" + codes.length + "')";
            sqlStore(sqlQ);
            processNotify(uuid, 'NR');
            var sqlPos = "SELECT * from pos WHERE uuid='" + uuid + "'";
            sqlQuery(sqlPos, function(err, results){
                if (err) console.error(err);
                for (var xi=0;results.length>xi;xi++){
                    var sqlQcode = "UPDATE pos SET code='NR' WHERE id='" + results[xi].id +"'";
                    sqlStore(sqlQcode);
                }
            })
        }

    });

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



function getReddisCount(className, sentence){
    return new Promise((resolve, reject) => {
        client.lrange(className, 0, -1, function(err, results){
            var vhold = []; //array of responces
             //array of classnames
            for (var i=0;results.length>i;i++){
                var verArr =[];
                verArr = wordTokenizer.tokenize(results[i]); //count number of words in target classification
                var nGrm = NGrams.ngrams(sentence, verArr.length); //splitting sentence into chunks based on target classication
                for (var xk=0;nGrm.length>xk;xk++){;
                    var sent = nGrm[xk].join(' '); //creating a "sentence string" from ngram target
                    var resp = natural.LevenshteinDistance(sent.toLowerCase(), results[i].toLowerCase(), {search: true}); //determining how close target and source strings are
                    var strDist = natural.JaroWinklerDistance(sent.toLowerCase(), results[i].toLowerCase()); //secondary method to determinate relationship of strings        
                    if ((resp.distance < 2 && resp.offset < 1) && strDist > 0.949){
                        if (env.VERB_LOG === 'True'){ console.log('[ALERT] >', className, strDist, sent, ' : ', results[i]) }
                        vhold.push(resp.substring); //pushing matched classification into array
                    }
                    if (className === 'PR' || className === 'NR'){
                        respRslt = strDist;
                    }
                }
            }
            if (vhold[0] === undefined){
                return resolve(null);
            }
            else {
                return resolve(vhold); //returning matched classifications
            }
        })
    })
    
}

//function to store sql information
function sqlStore(sql){
    writePool.getConnection(function(err, connection) {
        connection.query(sql, function(err){
            if (err) throw err;
        });
        connection.release();
    })
}

//API call to the logic app to notify it a decision needs to be made, including the hash, uuid and options
function notify(uuid, sentence, code){
    axios.post(process.env.RESPOND + token, {
        headers: {
        id: uuid,
        text: sentence,
        did: code
        }
    })
    .catch(error => {
        console.error(error)
    });
}

function processNotify(uuid, className){
    axios.post(process.env.PROCESS + token, {
        headers: {
        id: uuid,
        did: className
        }
    })
    .catch(error => {
        console.error(error)
    });
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