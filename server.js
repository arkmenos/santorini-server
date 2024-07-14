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
    transports:['websocket']
})

io.on('connection', socket => {
    console.log(`User ${socket.id} connected`)

    socket.emit('message', buildMsg(ADMIN, "Welcome to Arc's Santorini App!"))

    socket.on('createRoom', ({name, roomId, type}) =>{
        const user = addUser(socket.id, name, roomId, type)

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

    socket.on('enterRoom',  ({name, roomId, type}) =>{
        const roomUsers = [...getUsersInRoom(roomId)]

        if(roomUsers.length === 0){
            socket.emit('message', buildMsg(ADMIN, `Room ${roomId} does not exist. Please refresh and enter a valid room`))
        }else { 
            const spotAvailable = playerSpotAvailable(roomUsers)    
            
            if(!type && spotAvailable){
                //Rejoin as spectator             
                socket.emit('updatePlayer', spotAvailable)
            }

            const user = addUser(socket.id, name, roomId, type ? type :spotAvailable)    
            console.log(user)                 
            socket.join(user.roomId)
            socket.emit('getUsersInRoom', roomUsers)
            socket.broadcast.to(roomId).emit('userJoined', {name: name, roomId:user.roomId, type: type ? type :spotAvailable})
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
        socket.broadcast.to(user.roomId).emit('startGame')
        addBoardState(user.roomId, "5/5/5/5/5 X - - L22/M18/S14/D18 - - 1")
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
function addUser(id, name, roomId, type){
    const user = {id, name, roomId, type}
    
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
