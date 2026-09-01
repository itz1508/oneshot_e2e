import type { IncomingMessage, ServerResponse } from "node:http";

type Bucket={started:number;count:number};
export class HttpSecurity {
  private buckets=new Map<string,Bucket>();
  private windowMs=Math.max(1000,Number(process.env.API_RATE_LIMIT_WINDOW_MS||900000));
  private max=Math.max(1,Number(process.env.API_RATE_LIMIT_MAX||100));
  private origin=process.env.CORS_ORIGIN||"http://localhost:8787";
  private token=(process.env.ONESHOT_API_TOKEN||"").trim();
  headers(res:ServerResponse){
    res.setHeader("x-content-type-options","nosniff");res.setHeader("x-frame-options","DENY");res.setHeader("referrer-policy","no-referrer");res.setHeader("permissions-policy","camera=(), microphone=(), geolocation=()");res.setHeader("content-security-policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader("access-control-allow-origin",this.origin);res.setHeader("access-control-allow-methods","GET,POST,OPTIONS");res.setHeader("access-control-allow-headers","Content-Type,Authorization");res.setHeader("vary","Origin");
  }
  allowed(req:IncomingMessage,res:ServerResponse){
    if(req.method==="OPTIONS"){res.writeHead(204);res.end();return false;}
    const pathname=new URL(req.url||"/","http://localhost").pathname;
    const protectedApi=pathname==="/api"||pathname.startsWith("/api/")||pathname==="/v1"||pathname.startsWith("/v1/");
    if(protectedApi){
      const key=req.socket.remoteAddress||"unknown",now=Date.now(),old=this.buckets.get(key),b=!old||now-old.started>=this.windowMs?{started:now,count:0}:old;b.count++;this.buckets.set(key,b);res.setHeader("x-ratelimit-limit",String(this.max));res.setHeader("x-ratelimit-remaining",String(Math.max(0,this.max-b.count)));
      if(b.count>this.max){res.writeHead(429,{"content-type":"application/json; charset=utf-8"});res.end(JSON.stringify({error:"rate limit exceeded"}));return false;}
      if(this.token&&req.headers.authorization!==`Bearer ${this.token}`){res.writeHead(401,{"content-type":"application/json; charset=utf-8"});res.end(JSON.stringify({error:"unauthorized"}));return false;}
    }
    return true;
  }
}
