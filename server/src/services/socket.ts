import {Server as HttpServer} from 'http';
import {WebSocketServer,WebSocket} from 'ws';


interface ConnectedClient{
    ws:WebSocket;
    userId:string;
    repo:string;
}

const clients=new Map<string,ConnectedClient[]>();


export function setupWebSocketServer(server:HttpServer): void {
    const wss = new WebSocketServer({server});

    wss.on('connection',(ws:WebSocket)=>{
        console.log('[WS] New client connected');

        let clientInfo:ConnectedClient | null=null;

        ws.on('message',(data:Buffer)=>{
            try{
                const message = JSON.parse(data.toString());

                if(message.type==='subscribe'){
                    const {userId,repo}=message.payload;

                    if(!userId){
                        ws.close(1008,'Missing userId');
                        return;
                    }

                    const normalizedRepo = (repo ||'').toLowerCase();

                    clientInfo={ws,userId,repo:normalizedRepo};

                    if(!clients.has(userId)){
                        clients.set(userId,[]);
                    }
                    clients.get(userId)!.push(clientInfo);

                    console.log(`[WS] Client subscribed: userId=${userId}, repo=${normalizedRepo} || all`);

                }
            }catch(err){
                console.error('[WS] failed to parse message:',err);
            }
        });
        ws.on('close',()=>{
            if(clientInfo){
                const userConnections=clients.get(clientInfo.userId)||[];

                clients.set(
                    clientInfo.userId,
                    userConnections.filter((c)=>c!==clientInfo)
                );
                console.log(`[WS] Client disconnected:userId=${clientInfo.userId}`);
            }
        });

        ws.on('error',(err)=>{
            console.log('[WS] Connection error:',err);
        });
    });
}


export function broadcastToRepo(
    repo:string,
    data:any,
    userId?:string
):void{
    const normalizedRepo=(repo||'').toLowerCase();

    for(const [uid,userConnections] of clients.entries()){
        if(userId&&uid!==userId)continue;

        for(const client of userConnections){

            if(client.repo===''||client.repo===normalizedRepo){
                if(client.ws.readyState===WebSocket.OPEN){
                    try{
                        client.ws.send(
                            JSON.stringify({
                                type:'contextUpdate',
                                payload:data,
                            })
                        );
                    }catch(err){
                        console.error('[WS] Failed to send to client:',err);
                    }
                }
            }
        }
    }
}