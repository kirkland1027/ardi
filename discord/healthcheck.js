var http = require("http");
require('dotenv').config();
var request = http.request('http://localhost:' + process.env.PORT + '/?token=' + process.env.TOKEN, (res) => {  
    console.log(`STATUS: ${res.statusCode}`);
    if (res.statusCode === 200) {
        process.exit(0);
    }
    else {
        process.exit(1);
    }
});

request.on('error', function(err) {  
    console.log('ERROR');
    process.exit(1);
});

request.end(); 