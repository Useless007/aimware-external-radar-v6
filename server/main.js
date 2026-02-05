const fs = require("fs");
const app = require("express")();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const dgram = require('dgram');

// html file directory
let htmlPath = __dirname.replace(/(\\)/g, "/").split("/").slice(0, -1).join("/") + "/html";

// UDP server
const udpServer = dgram.createSocket('udp4');
const udpPort = 10001;
// SocketIO server
const socketPort = 10000;

// Load maps data
let maps = [];
try { maps = JSON.parse(fs.readFileSync(htmlPath + "/maps.json", "utf-8")); }
catch (err) {
    console.log("Unable to load maps data");
    process.exit(1);
}

// Load users
let users = []; // array of obj: {"userid": "133337", "username": "example", "authKey": "a0s9d8asd"}
try { users = JSON.parse(fs.readFileSync(__dirname + "/secret_users.json", "utf-8")); }
catch (err) {
    console.log("Unable to load users");
    process.exit(1);
}

// Listen for when UDP server is up & running
udpServer.on("listening", () => {
    const address = udpServer.address();
    console.log(`UDP listening ${address.address}:${address.port}`);
});

// Listen for incomming UDP messages
udpServer.on("message", (msg, rinfo) => {
    console.log(`[DEBUG] Recv from ${rinfo.address}:${rinfo.port} : ${msg.toString()}`);
    let data = parseData(msg.toString());
    if (data) {
        console.log("[DEBUG] Parse Success, emitting data");
        io.emit("data", data);
    } else {
        console.log("[DEBUG] Parse Failed");
    }
});

// Start UDP server
udpServer.bind(udpPort);

// Listen for new socketio connections
io.on("connection", socket => { });

// Listen for incomming GET requests
app.get("/*", (req, res) => res.sendFile(htmlPath + req.url));

// Start http server
http.listen(socketPort, () => {
    console.log("Socket listening on 0.0.0.0:" + socketPort);
});

// Parses incomming UDP data
function parseData(str) {
    let data = {};
    const validDataKeys = ["auth", "map", "players", "bomb", "rounds"];
    // Parse main body of data and check if any data was found .If none was found, return false.
    if (parseKeyValuePairs(str, "<", "|", ">").filter(d => validDataKeys.includes(d.key)).map(d => data[d.key] = d.value).length == 0) {
        console.log("[DEBUG] Failed to parse key-value pairs");
        return false;
    }
    // Authenticate user and replace auth with userid
    data.userid = authenticateUser(data.auth || null);
    if (data.userid === false) {
        console.log(`[DEBUG] Auth failed. Key: ${data.auth}`);
        return false;
    }
    delete data.auth;
    // Make sure data.rounds is a valid int & mapname is valid
    data.rounds = parseInt(data.rounds);
    if (maps.filter(m => m.name == data.map).length == 0 || isNaN(data.rounds)) {
        console.log(`[DEBUG] Invalid map or rounds. Map: ${data.map}, Rounds: ${data.rounds}`);
        return false;
    }
    // Parse remaining keys
    data.players = data.players.split(";").map(p => Object.fromEntries(parseKeyValuePairs(p, "{", ":", "}").map(d => parseKey("players", d.key, d.value)).filter(d => d[1] != null)));

    data.bomb = Object.fromEntries(parseKeyValuePairs(data.bomb, "{", ":", "}").map(d => parseKey("bomb", d.key, d.value)).filter(d => d[1] != null));
    return data;
}

// Parses str into array of key:value pairs
function parseKeyValuePairs(str, left, middle, right) {
    let reg = new RegExp("(" + left + "[^" + right + "]{0,}" + right + ")", "g");
    let matches = str.match(reg);
    if (!matches)
        return [];
    return matches.map(m => m.slice(1, -1).split(middle)).filter(m => m.length == 2).map(m => ({ key: m[0], value: m[1] }));
}

// Parses a key by making sure it's a valid key and its value is valid, returns [key, value]. On error value == null
function parseKey(category, key, value) {
    const keys = {
        players: { name: "s", team: "i", x: "f", y: "f", z: "f", steamid: "s", angle: "f", weaponName: "s", alive: "i", health: "i", ping: "i" },
        smokes: { x: "f", y: "f", z: "f" },
        bomb: { x: "f", y: "f", z: "f", time: "f" }
    };
    return !keys[category].hasOwnProperty(key) ? [key, null] : (keys[category][key] == "f" ? [key, parseFloat(value) || null] : (keys[category][key] == "i" ? [key, parseInt(value) || null] : [key, value]));
}

// Looks up key and checks if key is associated with a user
function authenticateUser(key) {
    for (let user of users)
        if (user.authKey === key)
            return user.userid;
    return false;
}
