let RuleEngine = require('json-rules-engine');
let engine = new RuleEngine.Engine();

let event = {
    type: "respond-QGP-PR",
    params: {
      action: "PR"
    }
};
let conditions = {
    all: [
      {
        fact: "code",
        operator: "contains",
        value: "Q"
      }, {
        fact: "code",
        operator: "contains",
        value: "P"
      }, {
        fact: "code",
        operator: "contains",
        value: "G"
      }
    ]
}

  let rule = new RuleEngine.Rule({ conditions, event });

  //engine.addRule(rule);

var jsonRule = rule.toJSON();
console.log(jsonRule)

engine.addRule(jsonRule)
