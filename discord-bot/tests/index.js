// Entry point so `node --test tests/` works on Node versions that treat the
// directory argument as the child entry module instead of scanning it for
// *.test.js files. On runners that do scan the directory, this file is not
// picked up (it does not match the default *.test.js glob).
import "./commandsShape.test.js";
import "./cooldowns.test.js";
import "./dice.test.js";
import "./diceMore.test.js";
import "./duration.test.js";
import "./durationMore.test.js";
import "./libAdditional.test.js";
import "./libEdge.test.js";
import "./libExtra.test.js";
import "./libFinal.test.js";
import "./libMore.test.js";
import "./libTwenty.test.js";
import "./randomness.test.js";
import "./stats.test.js";
