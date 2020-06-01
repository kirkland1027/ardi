//data sorting application
'use strict';
require('dotenv').config();
var redis = require('redis');
const natural = require('natural');
const stemmer = natural.PorterStemmer;
var mysql = require('mysql');
const sentenceTokenizer = new natural.SentenceTokenizer();
const wordTokenizer = new natural.WordTokenizer();
const env = process.env;
var fs = require('fs');
var client = redis.createClient(6379, env.REDIS); //creates a new client

const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  })




var writePool = mysql.createPool({
    host: env.SQL_HOST,
    user: env.ARDI_USER,
    password: env.ARDI_PW,
    database: env.ARDI_DB
});
  

start()
  
async function start(){
    client.on('connect', function(){
        console.log('Reddis Connected')
    });
    var sql = "SELECT data, verified, uuid FROM lang WHERE verified='0' ORDER BY id ASC"
    sqlQuery(sql, async function(err, results){
        if (err) console.err(err);
        for (var x=0;results.length>x;x++){        
            var data = sentenceTokenizer.tokenize(results[x].data);
            var words = [];
            for (var i=0;data.length>i;i++){
                var sentToken = [];
                var code = [];         
                console.log(data[i]);
                var wordHld = [];
                words = wordTokenizer.tokenize(data[i]);
                for (var ij=0; words.length>ij;ij++){
                    var ans = await getAnswer(words[ij]);
                    sentToken.push(ans);
                    var tmp = (ij - 1);
                    var tmpUp = (ij + 1)
                    if(tmp !== -1){
                        if (sentToken[tmp] !== sentToken[ij]){
                            code.push(sentToken[ij]);  
                            var wordString = wordHld.join(' ');                       
                            wordHld = [];
                            var index = sentToken[tmp];
                            client.lrem([index, -1, wordString]);
                            client.rpush(index, wordString)
                            var sql = "UPDATE lang SET verified='1' WHERE uuid='" + results[x].uuid + "'"
                            console.log('PUSHED:', tmp, index, wordString);
                            sqlStore(sql);
                        } 
                        if(tmpUp !== words.length){
                            wordHld.push(words[ij]);
                        } 
                        if(tmpUp === words.length){
                            wordHld.push(words[ij]);
                            var wordString = wordHld.join(' ');
                            console.log('PUSHED', ans, wordString)
                            client.lrem([ans, -1, wordString.toLowerCase()]);
                            client.rpush(ans, wordString.toLowerCase())
                            var sql = "UPDATE lang SET verified='1' WHERE uuid='" + results[x].uuid + "'"
                            console.log('PUSHED:', tmp, ans, wordString);
                            sqlStore(sql);
                        }
                    }
                    if(tmp === -1 && words.length !== 1){
                        code.push(sentToken[ij]);
                        wordHld.push(words[ij]);
                    }
                    if (words.length === 1){
                        wordHld.push(words[ij]);
                        var wordString = wordHld.join(' ');
                        client.lrem([ans, -1, wordString.toLowerCase()]);
                        client.rpush(ans, wordString)
                        var sql = "UPDATE lang SET verified='1' WHERE uuid='" + results[x].uuid + "'"
                        console.log('PUSHED', ans, wordString.toLowerCase());
                        sqlStore(sql);
                    }
                }
                //console.log(sentToken)
                //console.log(code);
                
                for (var xj=0;sentToken.length>xj;xj++){
                    var xj1 = (xj - 1);
                    if (sentToken[xj] !== sentToken[xj1]){

                    }
                }

            }
        }
    })
}


var stemArr = [];



//function to store sql information


function getAnswer(word){
    //for (var i=0;results.length>i;i++)
    return new Promise((resolve) => {
        readline.question(`${word}: `,(answer) => {
            return resolve(answer);      
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

//sql function with callback options for sql queries.
function sqlQuery(sql, callback) {
    writePool.getConnection((err, connection) => {
        if (err) {
            console.log(err);
            connection.release();
            callback(err.code, null);
        }
        connection.query(sql, (err, results) => {
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
