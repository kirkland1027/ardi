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
    var stemArr = [];
    for (var i=0; words.length>i;i++){
        stemArr.push(stemmer.stem(words[i]))
        
    }
    //console.log(stemArr);
    var lexicon = new natural.Lexicon(language, defaultCategory, defaultCategoryCapitalized);
    var ruleSet = new natural.RuleSet('EN');
    var tagger = new natural.BrillPOSTagger(lexicon, ruleSet);
    //console.log(tagger.tag(words));   
    
    //getting the members of the "class list type from redis"
    client.smembers('codes', async function(err, results){
        if (err) console.error(err);
        var rslts=[];
        var codes=[];
        for (var i=0;results.length>i;i++){
            //sending classification types for results
            var rst = await getReddisCount(results[i], stemArr, sentence);          
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



function getReddisCount(className, stemArr, sentence){
    //for (var i=0;results.length>i;i++)
    return new Promise((resolve, reject) => {
        //var cnt=0;
        //var holdStr = stemArr.join(' ');
        client.lrange(className, 0, -1, function(err, results){
            var xhold =[];
            var vhold = [];
            for (var i=0;results.length>i;i++){
                //console.log(className)
                var verArr =[];
                verArr = wordTokenizer.tokenize(results[i]);
                var nGrm = NGrams.ngrams(sentence, verArr.length)        
                for (var xk=0;nGrm.length>xk;xk++){;
                    var sent = nGrm[xk].join(' ');
                    //console.log(sent, ':', results[i]);
                    var resp = natural.LevenshteinDistance(sent.toLowerCase(), results[i].toLowerCase(), {search: true});
                    var strDist = natural.JaroWinklerDistance(sent.toLowerCase(), results[i].toLowerCase());
                    //console.log(resp)
                    if ((resp.distance < 2 && resp.offset < 1) && strDist > 0.949){
                        if (env.VERB_LOG === 'True'){ console.log('[ALERT] >', className, strDist, sent, ' : ', results[i]) }

                        if (xhold[className] !== undefined){
                            console.log('here')
                            var wordCnt = wordTokenizer.tokenize(xhold[className]);
                            var newCnt = wordTokenizer.tokenize(resp.substring);
                            var stringCnt = [];
                            stringCnt[xhold[className]] = wordCnt.length;
                            stringCnt[resp.substring] = newCnt.length;
                            var storeTot = Object.keys(stringCnt).reduce((a, b) => stringCnt[a] > stringCnt[b] ? a : b);
                            if (!vhold.includes(resp.substring)){
                                xhold.push(className);
                                vhold.push(resp.substring);
                            } 
                        } 
                        else {
                            xhold.push(className);
                            vhold.push(resp.substring);
                        }
                    }
                }           
            }
            if (xhold[0] === undefined || vhold[0] === undefined){
                return resolve(null);
            }
            else {
                var zhold = [{xhold}, {vhold}]
                return resolve(vhold);
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
    axios.post(process.env.PROCESS + token, {
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