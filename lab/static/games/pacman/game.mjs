import {createGame,LEVELS,direction,step,advance} from './engine.mjs';
const $=id=>document.getElementById(id), canvas=$('game'),ctx=canvas.getContext('2d');
let game=createGame(),last=0,acc=0,shown='',touch=null;
function setText(id,value){const e=$(id),s=String(value);if(e.textContent!==s)e.textContent=s;}
function sync(){const g=game;setText('score',g.score);setText('level',`${g.level+1} / 3`);setText('lives','● '.repeat(g.lives)||'—');$('pause').disabled=g.phase!=='playing'&&g.phase!=='paused';setText('pause',g.phase==='paused'?'Resume':'Pause');$('overlay').hidden=g.phase==='playing';
 setText('status',g.power&&g.phase==='playing'?'POWER UP · Chase the blue ghosts!':`${g.pellets.size} dots left · Swipe or tap to queue a turn`);
 if(shown===g.phase)return;shown=g.phase;if(g.phase==='playing'){canvas.focus({preventScroll:true});return;}
 const text={ready:[`LEVEL ${g.level+1} · ${LEVELS[g.level].name.toUpperCase()}`,'A little midnight snack?','Eat every dot. Dodge the ghosts. Big dots let you eat them for a few seconds.',"Let's play"],paused:['TAKE A BREATHER','Paused','Your maze will be right here.','Resume'],hurt:['WATCH THOSE GHOSTS','One life down',`${g.lives} lives left. Your collected dots are safe.`,'Keep going'],clear:['NICE WORK',`Level ${g.level+1} cleared`,'A new maze is waiting. Your score and lives carry over.','Next level'],over:['OUT OF LIVES','Ghosts got you',`Final score: ${g.score}. Try another run?`,'Play again'],won:['ALL THREE CLEARED','Midnight feast complete!',`Final score: ${g.score}. Nicely munched.`,'Play again']}[g.phase];
 [$('tag').textContent,$('heading').textContent,$('message').textContent,$('action').textContent]=text;$('action').focus({preventScroll:true});}
function play(){if(['won','over'].includes(game.phase))game=createGame();if(game.phase==='clear')advance(game);game.phase='playing';last=performance.now();acc=0;touch=null;sync();}
function pause(){if(game.phase==='playing'){game.phase='paused';touch=null;sync();}else if(game.phase==='paused')play();}
function activate(button,fn){button.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();fn();});button.addEventListener('click',e=>{if(e.detail===0)fn();});}
activate($('action'),play);activate($('pause'),pause);
function steer(d){if(game.phase==='playing')direction(game,d);}
document.querySelectorAll('[data-dir]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();steer(b.dataset.dir);});b.addEventListener('click',e=>{if(e.detail===0)steer(b.dataset.dir);});});
window.addEventListener('keydown',e=>{const keys={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};if(keys[e.key]&&game.phase==='playing'){e.preventDefault();steer(keys[e.key]);}if(e.key==='Escape')pause();});
canvas.addEventListener('pointerdown',e=>{touch={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!touch||e.pointerId!==touch.id)return;const dx=e.clientX-touch.x,dy=e.clientY-touch.y;if(Math.max(Math.abs(dx),Math.abs(dy))<14)return;steer(Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up');touch={x:e.clientX,y:e.clientY,id:e.pointerId};});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>touch=null);
function hide(){if(game.phase==='playing')pause();}window.addEventListener('blur',hide);document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();});
function draw(now){ctx.clearRect(0,0,600,600);const tile=40,g=game;ctx.fillStyle='#0b1223';ctx.fillRect(0,0,600,600);
 g.map.forEach((r,y)=>[...r].forEach((c,x)=>{if(c!=='#')return;ctx.fillStyle='#142548';ctx.strokeStyle=['#3463ba','#3b9393','#8862b6'][g.level];ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(x*tile+4,y*tile+4,32,32,7);ctx.fill();ctx.stroke();}));
 for(const [key,v]of g.pellets){const [x,y]=key.split(',').map(Number);ctx.fillStyle=v===50?'#ffe18a':'#d8cba8';ctx.beginPath();ctx.arc(x*40+20,y*40+20,v===50?6+Math.sin(now/160):2.6,0,Math.PI*2);ctx.fill();}
 const t=g.phase==='playing'?Math.min(1,acc/LEVELS[g.level].speed):1;
 function pos(a){return [(a.px+(a.x-a.px)*t)*40+20,(a.py+(a.y-a.py)*t)*40+20];}
 for(const e of g.ghosts){const [x,y]=pos(e);ctx.globalAlpha=e.wait?0.45:1;ctx.fillStyle=g.power?'#558cff':['#ff6887','#6cdfdb','#d19bff','#ffae68'][e.id];ctx.beginPath();ctx.arc(x,y,14,Math.PI,0);ctx.lineTo(x+14,y+14);ctx.lineTo(x+7,y+9);ctx.lineTo(x,y+14);ctx.lineTo(x-7,y+9);ctx.lineTo(x-14,y+14);ctx.closePath();ctx.fill();for(const dx of [-5,5]){ctx.fillStyle='white';ctx.beginPath();ctx.ellipse(x+dx,y-1,4,5,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#12254d';ctx.beginPath();ctx.arc(x+dx+1,y,2,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
 const [x,y]=pos(g.player);ctx.save();ctx.translate(x,y);ctx.rotate({right:0,down:Math.PI/2,left:Math.PI,up:-Math.PI/2}[g.player.dir]);ctx.fillStyle='#ffdc62';ctx.globalAlpha=g.grace&&g.phase==='playing'?0.65+0.35*Math.sin(now/100):1;const mouth=.12+.22*(1+Math.sin(now/80));ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,15,mouth,Math.PI*2-mouth);ctx.closePath();ctx.fill();ctx.restore();}
function frame(now){if(game.phase==='playing'){acc+=Math.min(now-last,100);const speed=LEVELS[game.level].speed;while(acc>=speed&&game.phase==='playing'){step(game);acc-=speed;}}last=now;sync();draw(now);requestAnimationFrame(frame);}
// Read-only snapshot for smoke checks; game mutation stays inside the engine.
window.getNightMunchState=()=>({level:game.level+1,phase:game.phase,score:game.score,lives:game.lives,remaining:game.pellets.size,player:{...game.player},queued:game.queued});
sync();requestAnimationFrame(frame);
