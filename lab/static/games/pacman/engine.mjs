export const DIR = {up:[0,-1],right:[1,0],down:[0,1],left:[-1,0]};
const base = [
'###############',
'#o...........o#',
'#.###.#.#.###.#',
'#.....#.#.....#',
'#.###.#.#.###.#',
'#...#.....#...#',
'###.#.###.#.###',
'#.....#.#.....#',
'#.###.#.#.###.#',
'#.............#',
'#.###.###.###.#',
'#...#.....#...#',
'#.#.#.###.#.#.#',
'#o...........o#',
'###############'];
export const LEVELS = [
 {name:'First bite',map:base, speed:180, ghosts:2},
 {name:'Crossroads',map:base.map((r,y)=>y===6?'#.#.#.#.#.#.#.#':y===10?'#.#.#.#.#.#.#.#':r),speed:165,ghosts:3},
 {name:'Midnight run',map:base.map((r,y)=>y===4?'#.#.#.#.#.#.#.#':y===8?'#.#.#.#.#.#.#.#':r),speed:150,ghosts:4}
];
export function createGame(){return load({level:0,score:0,lives:3});}
function actor(x,y){return {x,y,px:x,py:y,dir:'left'};}
function reset(g){g.player=actor(7,13);g.ghosts=[[7,5],[1,1],[13,1],[7,9]].slice(0,LEVELS[g.level].ghosts).map(([x,y],i)=>({...actor(x,y),home:[x,y],id:i,wait:12+i*5}));g.queued='left';g.power=0;g.grace=12;}
function load(g){g.map=LEVELS[g.level].map;g.pellets=new Map();g.map.forEach((r,y)=>[...r].forEach((c,x)=>{if(c!=='#')g.pellets.set(`${x},${y}`,c==='o'?50:10);}));g.pellets.delete('7,13');g.tick=0;reset(g);g.phase='ready';return g;}
export function walk(g,x,y){return g.map[y]?.[x]!==undefined&&g.map[y][x]!=='#';}
export function direction(g,d){if(Object.hasOwn(DIR,d))g.queued=d;}
export function advance(g){if(g.phase==='clear'&&g.level<2){g.level++;load(g);}return g;}
function legal(g,a,d){const [x,y]=DIR[d];return walk(g,a.x+x,a.y+y);}
function move(a,d){a.dir=d;a.x+=DIR[d][0];a.y+=DIR[d][1];}
function collide(g){if(g.grace)return false;for(const e of g.ghosts){if(e.wait>0)continue;const hit=(e.x===g.player.x&&e.y===g.player.y)||(e.px===g.player.x&&e.py===g.player.y&&e.x===g.player.px&&e.y===g.player.py);if(!hit)continue;if(g.power){g.score+=200;[e.x,e.y]=e.home;e.px=e.x;e.py=e.y;e.wait=20;}else{g.lives--;reset(g);g.phase=g.lives?'hurt':'over';return true;}}return false;}
export function step(g){if(g.phase!=='playing')return;g.tick++;g.power=Math.max(0,g.power-1);g.grace=Math.max(0,g.grace-1);
 for(const a of [g.player,...g.ghosts]){a.px=a.x;a.py=a.y;}
 if(legal(g,g.player,g.queued))g.player.dir=g.queued;
 if(legal(g,g.player,g.player.dir))move(g.player,g.player.dir);
 const key=`${g.player.x},${g.player.y}`,v=g.pellets.get(key);if(v){g.pellets.delete(key);g.score+=v;if(v===50)g.power=38;}
 if(collide(g))return;
 for(const e of g.ghosts){if(e.wait){e.wait--;continue;}if(g.tick%2)continue;
 let choices=Object.keys(DIR).filter(d=>legal(g,e,d));const forward=choices.filter(d=>DIR[d][0]!==-DIR[e.dir][0]||DIR[d][1]!==-DIR[e.dir][1]);if(forward.length)choices=forward;
 const scatter=g.tick%70<20;const target=scatter?[[1,1],[13,1],[1,13],[13,13]][e.id]:[g.player.x,g.player.y];
 choices.sort((a,b)=>{const dist=d=>Math.abs(e.x+DIR[d][0]-target[0])+Math.abs(e.y+DIR[d][1]-target[1]);return (dist(a)-dist(b))*(g.power?-1:1);});if(choices[0])move(e,choices[0]);}
 if(collide(g))return;if(!g.pellets.size)g.phase=g.level===2?'won':'clear';
}
