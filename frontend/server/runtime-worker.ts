import { createServices } from './service';
interface Environment { ASSETS: { fetch(request:Request):Promise<Response> } }
const service=createServices();
export default {async fetch(request:Request,env:Environment):Promise<Response>{
  if(new URL(request.url).pathname.startsWith('/api/')){
    // Cloudflare supplies this header at its ingress; Node uses the socket address.
    return service.handle(request,request.headers.get('CF-Connecting-IP')??'unknown');
  }
  return env.ASSETS.fetch(request);
}};
