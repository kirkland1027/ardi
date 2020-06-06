
const rosaenlgPug = require('rosaenlg');



let phones = [
    {
      name: 'OnePlus 5T',
      colors: ['Black', 'Red', 'White'],
      displaySize: 6,
      screenRatio: 80.43,
      battery: 3300,
    }
  ];


let res = rosaenlgPug.renderFile('tuto.pug', {
    language: 'en_US',
    phone: phones[0]
});

console.log( res );
