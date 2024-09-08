import express from 'express'
import { Server} from 'socket.io'
import cors from "cors"
import { corsOptions } from './config/corOptions.js'

const PORT = process.env.PORT || 4000
const ADMIN = "Admin"

const app = express();
app.use((req, res, next) => {
    res.setHeader(
      "Access-Control-Allow-Origin",
      "https://santorini-app.onrender.com/"
    );
    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS,CONNECT,TRACE"
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Content-Type-Options, Accept, X-Requested-With, Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
      );
      res.setHeader("Access-Control-Allow-Credentials", true);
      res.setHeader("Access-Control-Allow-Private-Network", true);
    next();
})

app.use(cors(corsOptions));

const expressServer = app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`)
})

const GamesState = {
    users: [],
    boardStates: [],
    setUsers: function (newUsersArray){
        this.users = newUsersArray
    },
    setBoardStates: function (newBoardStates){
        this.boardStates = newBoardStates
    }
}

const io = new Server(expressServer, {
    cors: {
        origin:  "https://santorini-app.onrender.com/",
        methods:["GET", "POST"],
        allowedHeaders:["Access-Control-Allow-Origin"],
        credentials: true
    },
    transports:['websocket', 'polling', 'webtransport'],
    secure: true
})

io.on('connection', socket => {
    console.log(`User ${socket.id} connected`)

    socket.emit('message', buildMsg(ADMIN, "Welcome to Arc's Santorini App!"))

    socket.on('createRoom', ({name, roomId, type, identifier}) =>{
        const user = addUser(socket.id, name, roomId, type, identifier)

        console.log(user)
        socket.join(user.roomId)

        socket.emit('message', buildMsg(ADMIN, `${user.name}, your room id is: ${user.roomId}`))
    })

    io.engine.on("connection_error", (err) => {
        console.log(err.req);      // the request object
        console.log(err.code);     // the error code, for example 1
        console.log(err.message);  // the error message, for example "Session ID unknown"
        console.log(err.context);  // some additional error context
      });

    socket.on('enterRoom',  ({name, roomId, type, identifier}) =>{
        const roomUsers = [...getUsersInRoom(roomId)]

        if(roomUsers.length === 0){
            socket.emit('message', buildMsg(ADMIN, `Room ${roomId} does not exist. Please refresh and enter a valid room`))
        }else { 
            const spotAvailable = playerSpotAvailable(roomUsers)    
            
            if(!type && spotAvailable){
                //Rejoin as spectator             
                socket.emit('updatePlayer', {name:name, roomId:roomId, 
                    type:spotAvailable, identifier: identifier})
            }

            const user = addUser(socket.id, name, roomId, type ? type :spotAvailable, identifier)    
            console.log(user)                 
            socket.join(user.roomId)
            socket.emit('getUsersInRoom', roomUsers)
            socket.broadcast.to(roomId).emit('userJoined', {name: name, roomId:user.roomId, 
                type: type ? type :spotAvailable, identifier: identifier})
            // if(type === "S"){
                // const bstate = GamesState.boardStates.find(b=> b.roomId === roomId)
                // socket.emit('getBoardState', )
            //     socket.emit('message', buildMsg(ADMIN, `${user.name} have joined room ${user.roomId} as a spectator`))
            //     socket.broadcast.to(user.roomId).emit('message', buildMsg(ADMIN, `${user.name} has joined the room as a spectator`))
            // }else{
                // user.game = {boardState: "start",moveCount : 1 }
            //     io.to(user.roomId).emit('ready')
            //     socket.emit('message', buildMsg(ADMIN, `${user.name} have joined room ${user.roomId}`))
            //     socket.broadcast.to(user.roomId).emit('message', buildMsg(ADMIN, `${user.name} has joined the room`))
            // }               
            
        }
    })

    socket.on('startGame', () =>{
        console.log("game started")
        const user = getUser(socket.id)
        const allPlayers = getUsersInRoom(user.roomId)
        let powers = ""
        const playerX = allPlayers.filter(p => p.type === "X")
        const playerY = allPlayers.filter(p => p.type === "Y")
        if(playerX.identifier) powers += playerX.identifier + "/"
        if(playerY.identifier) powers += playerY.identifier
        if(allPlayers.length === 3){
            const playerZ = allPlayers.filter(p => p.type === "Z")
            if(playerZ.identifier) powers += "/" + playerZ.identifier
        }
        if(powers === "") powers = "-"
        socket.broadcast.to(user.roomId).emit('startGame')
        addBoardState(user.roomId, "5/5/5/5/5 X - " + powers + " L22/M18/S14/D18 - - 1")
        console.log("game started" )
        console.log("5/5/5/5/5 X - " + powers + " L22/M18/S14/D18 - - 1")
    })

    socket.on('pickPower', () =>{
        
        const user = getUser(socket.id)
        socket.broadcast.to(user.roomId).emit('pickPower')
    })

    socket.on('X-PowerPick', () =>{
        console.log("x Pick turn")
        const user = getUser(socket.id)
        socket.broadcast.to(user.roomId).emit('X-PowerPick')
    })

    socket.on('Y-PowerPick', () =>{
        console.log("y Pick turn")
        const user = getUser(socket.id)
        socket.broadcast.to(user.roomId).emit('Y-PowerPick')
    })

    socket.on('Z-PowerPick', () =>{
        console.log("z Pick turn")
        const user = getUser(socket.id)
        socket.broadcast.to(user.roomId).emit('Z-PowerPick')
    })

    socket.on('updatePlayerPower', ({name, roomId, type, identifier}) =>{
        console.log("updating Player Power", name, roomId, type, identifier)
        // const roomUsers = [...getUsersInRoom(playerInfo.roomId)]
        // if( playerInfo && isPowerPicked(playerInfo.identifier, roomUsers)){
        //     socket.emit('updatePlayer', {name: playerInfo.name, roomId: playerInfo.roomId,
        //         type:playerInfo.type, identifier: null
        //     })
        // }
        const user = getUser(socket.id)
        if(user.identifier !== identifier){
            const roomUsers = [...getUsersInRoom(user.roomId)]
            const powerInUse = roomUsers.find(u=> u.type != type && u.identifier === identifier)
            if(powerInUse) {
                socket.broadcast.to(user.roomId).emit('updatePlayerPower', {name:name, roomId:roomId, 
                type:spotAvailable, identifier: null})
                addUser(user.id, name, roomId, type, null)
            }
            else{
                addUser(user.id, name, roomId, type, identifier)
                socket.broadcast.to(user.roomId).emit('updatePlayerPower', {name, roomId, type, identifier})            
            }
        }
    })
    socket.on('takeTurn', turn => {
        console.log('takeTurn')
        const user = getUser(socket.id)
        socket.broadcast.to(user.roomId).emit('takeTurn', turn)
    })

    socket.on('message', (text)=>{
        const user = getUser(socket.id)

        if(user){
            io.to(user.roomId).emit('message', buildMsg(user.name, text))
        }
    })

    socket.on('boardState', ({roomId, boardState}) => {
        const newBoardState = addBoardState(roomId, boardState);
    })

    socket.on('getBoardState', () => {
        const user = getUser(socket.id)
        const boardState = getBoardState(user?.roomId)
        socket.emit('getBoardState', boardState)
    })

    socket.on('disconnect', () => {
        const user = getUser(socket.id)
        userLeavesGame(socket.id)

        if(user){
            io.to(user.roomId).emit('message', buildMsg(ADMIN, `${user.name} has left the room`))
            removeUser(socket.id)
        }
    })


})

function buildMsg(name, text){
    return {
        name,
        text,
        time: new Intl.DateTimeFormat('default', {
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric'
        }).format(new Date())
    }
}
function addUser(id, name, roomId, type, identifier){
    const user = {id, name, roomId, type, identifier}
    
    GamesState.setUsers([...GamesState.users.filter( user => user.id !==id), user])
    return user
}

function playerSpotAvailable(roomUsers){
    const playerTwo = roomUsers.find(user => user.type === "Y")
    if(!playerTwo) return "Y"

    const playerThree = roomUsers.find(user => user.type === "Z")
    if(!playerThree) return "Z"

    return "S"
}

function isPowerPicked(power, roomUsers){
    return roomUsers.find(user => user.identifier === power)
}

function findOpponent(id) {
    const user = getUser(id)
    const usersInRoom = getUsersInRoom(user?.roomId)
    const opponent = usersInRoom.find(usr => usr.type !== user.type 
        && usr.type !== "spectator")
       
    return opponent 
}

function addBoardState(roomId, boardState){
    const newBoardState = {roomId, boardState}

    GamesState.setBoardStates([...GamesState.boardStates.filter( newBoard =>
        newBoard.roomId !== roomId), newBoardState])
    return newBoardState;
}

function getBoardState(roomId){
    return GamesState.boardStates.find(bStates => bStates.roomId === roomId) 
}

function removeUser(id){
    GamesState.setUsers(GamesState.users.filter(user => user.id !== id))
}

function getUser(id) {
    return GamesState.users.find(user => user.id === id)
}

function getUsersInRoom(roomId) {
    return GamesState.users.filter(user => user.roomId === roomId)
}

function userLeavesGame(id){
    GamesState.setUsers( GamesState.users.filter(user => user.id !== id))
}