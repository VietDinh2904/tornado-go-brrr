(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const W = canvas.width, H = canvas.height;
  const screens = { map: $('mapScreen'), charge: $('chargeScreen'), result: $('resultScreen') };
  const ui = {
    fRank:$('fRank'), rankName:$('rankName'), energyText:$('energyText'), energyBar:$('energyBar'), score:$('scoreText'), combo:$('comboText'), timer:$('timerText'), weather:$('weatherText'), missions:$('missions'), missionCount:$('missionCount'), toast:$('toast'), radio:$('radioText'), checkpoint:$('checkpointLabel'), unlockBar:$('unlockBar'), unlockText:$('unlockText'), hint:$('controlHint')
  };
  const saveKey = 'tornadoGoBrrrPilotV1';
  const saved = JSON.parse(localStorage.getItem(saveKey) || '{}');
  let audioOn = true, audioCtx, micStream, analyser, micData;
  let state = 'map', last = performance.now(), chargeEnds = 0, chargeEnergy = 0, runEnds = 0;
  let score = 0, combo = 1, comboTime = 0, peopleCaught = 0, carsCaught = 0, structuresHit = 0, missionsDone = 0;
  let objects = [], particles = [], bubbles = [], keys = {}, mouse = {x:W/2,y:H/2,down:false};
  let weather = 'clear', weatherClock = 0, lightningClock = 8;
  let tornado = {x:W/2,y:H/2,vx:0,vy:0,energy:0,radius:28,rank:0};
  const ranks = [
    {name:'Gió lăn tăn',min:0,color:'#79d7ef'}, {name:'Quậy khu phố',min:28,color:'#5de0c6'},
    {name:'Bay mái nhà',min:52,color:'#ffd447'}, {name:'Đại náo thị trấn',min:78,color:'#ff7849'}
  ];
  const shouts = ['HELP!','AAAAAAAA!','NOT AGAIN!','MY CAR!','I JUST FIXED THAT!','FREE FLIGHT!','SAVE THE PIZZA!','WHY IS THERE A COW?!','MẸ ƠI!','TUI ĐANG BAY!'];
  const radios = ['“Thời tiết hôm nay hoàn toàn bình thường...”','“Có một cái mái nhà vừa bay ngang studio.”','“Ai thấy con bò số 47 xin gọi đài.”','“Windy Creek: gió nhẹ, đồ đạc bay nhiều.”','“Đừng lo, đây chắc chắn chỉ là... mây.”'];
  const missionDefs = [
    {id:'people',icon:'🙋',name:'Chuyến bay miễn phí',desc:'Hút 8 người dân',goal:8,get:()=>peopleCaught},
    {id:'cars',icon:'🚗',name:'Bãi xe trên trời',desc:'Hút 4 chiếc xe',goal:4,get:()=>carsCaught},
    {id:'score',icon:'⭐',name:'Quậy có nghề',desc:'Đạt 4,000 điểm',goal:4000,get:()=>score},
  ];

  function showScreen(name){ Object.values(screens).forEach(x=>x.classList.remove('active')); if(name) screens[name].classList.add('active'); }
  function tone(freq=220,dur=.08,type='square',vol=.04){
    if(!audioOn) return; audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(vol,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur);
  }
  function toast(text){ ui.toast.textContent=text;ui.toast.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>ui.toast.classList.remove('show'),1400); }
  function updateSaveLabel(){ ui.checkpoint.textContent = saved.best ? `${saved.best.toLocaleString('vi-VN')} ĐIỂM` : 'CHƯA CÓ'; const total=Math.min(12000,saved.total||0);ui.unlockBar.style.width=`${total/120}%`;ui.unlockText.textContent=`${total.toLocaleString('vi-VN')} / 12,000 điểm`; }
  updateSaveLabel();

  function beginCharge(){
    state='charge';showScreen('charge');chargeEnergy=8;chargeEnds=performance.now()+5000;$('chargeBar').style.width='8%';$('chargeCount').textContent='5';tone(260,.12);
  }
  function addCharge(amount=2.2){
    if(state!=='charge') return;chargeEnergy=Math.min(100,chargeEnergy+amount);$('chargeBar').style.width=`${chargeEnergy}%`;tone(180+chargeEnergy*4,.035,'square',.025);
    $('generateBtn').animate([{transform:'scale(1)'},{transform:'scale(.96)'},{transform:'scale(1)'}],{duration:90});
  }
  async function enableMic(){
    try{ micStream=await navigator.mediaDevices.getUserMedia({audio:true});audioCtx||=new (window.AudioContext||window.webkitAudioContext)();analyser=audioCtx.createAnalyser();analyser.fftSize=256;micData=new Uint8Array(analyser.frequencyBinCount);audioCtx.createMediaStreamSource(micStream).connect(analyser);$('micBtn').textContent='🎙 MIC ĐANG NGHE';toast('Mic đã bật — cứ hét thoải mái!'); }
    catch(e){ toast('Không mở được mic — dùng nút GENERATE nhé!'); }
  }
  function initMissions(){
    missionDefs.forEach(m=>m.done=false);missionsDone=0;ui.missions.innerHTML=missionDefs.map(m=>`<div class="mission" id="m-${m.id}"><div class="mission-icon">${m.icon}</div><div><b>${m.name}</b><small>${m.desc}</small><div class="progress"><i></i></div></div></div>`).join('');ui.missionCount.textContent='0/3';
  }
  function spawnWorld(){
    objects=[];particles=[];bubbles=[];
    const add=(type,x,y,extra={})=>objects.push({type,x,y,vx:0,vy:0,spin:0,caught:false,...extra});
    for(let i=0;i<18;i++) add('house',80+(i%6)*155+Math.random()*25,75+Math.floor(i/6)*190+Math.random()*20,{hp:55+Math.random()*30,w:52,h:43,color:['#ef8354','#e0a458','#57a0a8','#d96868'][i%4]});
    for(let i=0;i<34;i++) add('tree',30+Math.random()*900,28+Math.random()*480,{hp:18});
    for(let i=0;i<25;i++) add('person',40+Math.random()*880,40+Math.random()*450,{dir:Math.random()*6.28,speed:8+Math.random()*13,color:['#ffd166','#ef476f','#86e1f7','#a7f070'][i%4]});
    for(let i=0;i<12;i++) add('car',80+Math.random()*800,Math.random()>.5?267:301,{dir:Math.random()>.5?0:Math.PI,speed:24+Math.random()*15,color:['#ff5c5c','#ffd447','#59b8ff','#f4f4f4'][i%4]});
    for(let i=0;i<5;i++) add('cow',100+Math.random()*760,50+Math.random()*420,{dir:Math.random()*6.28,speed:5});
    objects.push({type:'storm',x:100+Math.random()*760,y:80+Math.random()*350,r:48,phase:0});
  }
  function startRun(){
    state='play';showScreen();score=0;combo=1;comboTime=0;peopleCaught=0;carsCaught=0;structuresHit=0;weather='clear';weatherClock=0;lightningClock=8;tornado={x:W/2,y:H/2,vx:0,vy:0,energy:Math.max(12,chargeEnergy),radius:28,rank:0};runEnds=performance.now()+180000;spawnWorld();initMissions();ui.hint.style.display='block';setTimeout(()=>ui.hint.style.display='none',4500);toast('WINDY CREEK — GO BRRR!');tone(110,.35,'sawtooth',.06);
  }
  function finishRun(){
    if(state!=='play')return;state='result';showScreen('result');ui.hint.style.display='none';const bonus=missionsDone*750;score+=bonus;saved.best=Math.max(saved.best||0,score);saved.total=(saved.total||0)+score;saved.runs=(saved.runs||0)+1;saved.last={score,peopleCaught,carsCaught,missionsDone,date:Date.now()};localStorage.setItem(saveKey,JSON.stringify(saved));updateSaveLabel();$('resultScore').textContent=score.toLocaleString('vi-VN');$('resultTitle').textContent=missionsDone===3?'THỊ TRẤN ĐÃ... BAY!':'CƠN GIÓ CÓ TIỀM NĂNG!';$('resultStats').innerHTML=`<div><b>${peopleCaught}</b><small>NGƯỜI BAY</small></div><div><b>${carsCaught}</b><small>XE BAY</small></div><div><b>${missionsDone}/3</b><small>NHIỆM VỤ</small></div>`;tone(440,.16);setTimeout(()=>tone(660,.22),160);
  }
  function addBubble(x,y,text){bubbles.push({x,y,text,life:1.4});}
  function debris(x,y,color,count=5){for(let i=0;i<count;i++)particles.push({x,y,vx:(Math.random()-.5)*90,vy:(Math.random()-.5)*90,life:.8+Math.random(),color,size:3+Math.random()*5});}
  function collect(o,points,label){
    if(o.caught)return;o.caught=true;score+=Math.round(points*combo);combo=Math.min(8,combo+1);comboTime=2.1;tornado.energy=Math.min(100,tornado.energy+1.5);debris(o.x,o.y,o.color||'#d6e1ef',8);if(label)addBubble(o.x,o.y,label);tone(260+combo*38,.06);
  }
  function update(dt,now){
    if(state==='charge'){
      const remain=Math.max(0,chargeEnds-now);$('chargeCount').textContent=Math.ceil(remain/1000);
      if(analyser){analyser.getByteFrequencyData(micData);const avg=micData.reduce((a,b)=>a+b,0)/micData.length;if(avg>28)addCharge(Math.min(.9,avg/180));}
      if(remain<=0)startRun();return;
    }
    if(state!=='play')return;
    const timeLeft=Math.max(0,runEnds-now);if(timeLeft<=0||tornado.energy<=0){finishRun();return;}
    let ax=0,ay=0;if(keys.KeyW||keys.ArrowUp)ay--;if(keys.KeyS||keys.ArrowDown)ay++;if(keys.KeyA||keys.ArrowLeft)ax--;if(keys.KeyD||keys.ArrowRight)ax++;
    if(mouse.down){const dx=mouse.x-tornado.x,dy=mouse.y-tornado.y,d=Math.hypot(dx,dy)||1;ax+=dx/d;ay+=dy/d;}
    const al=Math.hypot(ax,ay)||1,speed=82+14*tornado.rank;tornado.vx+=(ax/al*speed-tornado.vx)*Math.min(1,dt*4);tornado.vy+=(ay/al*speed-tornado.vy)*Math.min(1,dt*4);if(!ax&&!ay){tornado.vx*=.91;tornado.vy*=.91;}
    tornado.x=Math.max(20,Math.min(W-20,tornado.x+tornado.vx*dt));tornado.y=Math.max(20,Math.min(H-20,tornado.y+tornado.vy*dt));
    tornado.energy=Math.max(0,tornado.energy-dt*(.52+tornado.rank*.2));const rank=Math.min(3,tornado.energy>=78&&score>2800?3:tornado.energy>=52&&score>1100?2:tornado.energy>=28?1:0);if(rank!==tornado.rank&&rank>tornado.rank)toast(`${['','F1 — QUẬY KHU PHỐ!','F2 — BAY MÁI NHÀ!','F3 — ĐẠI NÁO!'][rank]}`);tornado.rank=rank;tornado.radius=30+rank*14+tornado.energy*.09;
    weatherClock+=dt;if(weatherClock>34){weatherClock=0;weather=weather==='clear'?'rain':weather==='rain'?'night':'clear';toast(weather==='rain'?'MƯA LỚN — LỰC HÚT TĂNG!':weather==='night'?'HOÀNG HÔN — XE CHẠY NHANH HƠN!':'TRỜI QUANG TRỞ LẠI');ui.radio.textContent=radios[Math.floor(Math.random()*radios.length)];}
    lightningClock-=dt;if(weather==='rain'&&lightningClock<0){lightningClock=6+Math.random()*7;tornado.energy=Math.min(100,tornado.energy+5);toast('⚡ SÉT NẠP +5 NĂNG LƯỢNG!');tone(75,.3,'sawtooth',.08);}
    const pull=tornado.radius*(weather==='rain'?1.35:1);
    objects.forEach(o=>{
      if(o.caught)return;if(o.type==='storm'){o.phase+=dt;const sd=Math.hypot(o.x-tornado.x,o.y-tornado.y);if(sd<o.r+tornado.radius){tornado.energy=Math.min(100,tornado.energy+dt*5);if(Math.random()<dt*.5)addBubble(o.x,o.y,'+ STORM ENERGY');}return;}
      if(o.type==='person'||o.type==='car'||o.type==='cow'){o.dir+=(Math.random()-.5)*dt*(o.type==='person'?2:.4);o.x+=Math.cos(o.dir)*(o.speed||8)*dt*(weather==='night'&&o.type==='car'?1.6:1);o.y+=Math.sin(o.dir)*(o.speed||8)*dt;if(o.x<10||o.x>W-10)o.dir=Math.PI-o.dir;if(o.y<10||o.y>H-10)o.dir=-o.dir;}
      const dx=tornado.x-o.x,dy=tornado.y-o.y,d=Math.hypot(dx,dy)||1;const weight=o.type==='house'?3:o.type==='car'?1.8:o.type==='tree'?1.3:1;const canLift=(o.type==='house'?tornado.rank>=2:o.type==='car'?tornado.rank>=1:true);
      if(d<pull*2.25){const force=(1-d/(pull*2.25))*105/weight;o.vx+=dx/d*force*dt;o.vy+=dy/d*force*dt;o.spin+=dt*force*.08;if(canLift&&d<pull*.63){if(o.type==='person'){peopleCaught++;collect(o,120,shouts[Math.floor(Math.random()*shouts.length)]);}else if(o.type==='car'){carsCaught++;collect(o,260,'MY CAR!');}else if(o.type==='cow')collect(o,360,'MOOOO?!');else if(o.type==='tree'){collect(o,85,'CRACK!');}else{structuresHit++;collect(o,520,'MY ROOF!');}}
      }
      o.x+=o.vx*dt;o.y+=o.vy*dt;o.vx*=.95;o.vy*=.95;
    });
    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=25*dt;p.life-=dt});particles=particles.filter(p=>p.life>0);bubbles.forEach(b=>{b.y-=18*dt;b.life-=dt});bubbles=bubbles.filter(b=>b.life>0);
    if(comboTime>0)comboTime-=dt;else combo=Math.max(1,combo-1);
    missionDefs.forEach(m=>{const val=m.get(),ratio=Math.min(1,val/m.goal),el=$(`m-${m.id}`);el.querySelector('i').style.width=`${ratio*100}%`;if(!m.done&&ratio>=1){m.done=true;missionsDone++;score+=500;el.classList.add('done');ui.missionCount.textContent=`${missionsDone}/3`;toast(`✓ ${m.name.toUpperCase()} +500`);tone(720,.18);}});
    updateHud(timeLeft);
  }
  function updateHud(timeLeft){
    ui.fRank.textContent=`F${tornado.rank}`;ui.fRank.style.color=ranks[tornado.rank].color;ui.rankName.textContent=ranks[tornado.rank].name;ui.energyText.textContent=`${Math.ceil(tornado.energy)}%`;ui.energyBar.style.width=`${tornado.energy}%`;ui.score.textContent=String(score).padStart(6,'0');ui.combo.textContent=`x${combo}`;const s=Math.ceil(timeLeft/1000);ui.timer.textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;ui.weather.textContent=weather==='clear'?'☀ TRỜI QUANG':weather==='rain'?'⚡ MƯA GIÔNG':'☾ HOÀNG HÔN';
  }
  function pxRect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
  function drawGround(){
    const night=weather==='night';ctx.fillStyle=night?'#27454b':'#5e9b67';ctx.fillRect(0,0,W,H);
    for(let x=0;x<W;x+=32)for(let y=0;y<H;y+=32){if((x/32+y/32)%3===0)pxRect(x+5,y+8,3,6,night?'#365c55':'#79b56f');}
    pxRect(0,245,W,84,night?'#3c4751':'#66717b');pxRect(0,280,W,4,'#e9cf5b');for(let x=0;x<W;x+=58)pxRect(x,283,30,4,'#e9cf5b');
    pxRect(465,0,70,H,night?'#3c4751':'#66717b');pxRect(497,0,4,H,'#e9cf5b');for(let y=0;y<H;y+=58)pxRect(497,y,4,30,'#e9cf5b');
    if(weather==='rain'){ctx.fillStyle='#80d8ff44';for(let i=0;i<75;i++){const x=(i*83+performance.now()*.18)%W,y=(i*47+performance.now()*.5)%H;ctx.fillRect(x,y,2,9);}}
  }
  function drawObject(o){
    if(o.caught||o.type==='storm')return;ctx.save();ctx.translate(Math.round(o.x),Math.round(o.y));ctx.rotate(o.spin);
    if(o.type==='house'){pxRect(-o.w/2,-o.h/2,o.w,o.h,o.color);pxRect(-o.w/2-4,-o.h/2-10,o.w+8,14,'#553c45');pxRect(-6,2,13,20,'#573827');pxRect(-20,-3,9,9,'#9ee7f5');}
    if(o.type==='tree'){pxRect(-3,-5,7,19,'#68462d');pxRect(-13,-20,26,19,'#23633e');pxRect(-8,-27,17,16,'#348151');}
    if(o.type==='person'){pxRect(-3,-9,7,7,'#f1c27d');pxRect(-4,-2,9,10,o.color);pxRect(-6,8,4,7,'#223047');pxRect(3,8,4,7,'#223047');}
    if(o.type==='car'){pxRect(-15,-8,30,16,o.color);pxRect(-8,-13,17,7,'#b6edff');pxRect(-11,8,7,4,'#182132');pxRect(6,8,7,4,'#182132');}
    if(o.type==='cow'){pxRect(-13,-7,26,14,'#f3f1e8');pxRect(-11,-6,7,7,'#27313d');pxRect(4,-5,6,6,'#27313d');pxRect(12,-5,8,9,'#f3f1e8');pxRect(-9,7,3,9,'#3a2c29');pxRect(7,7,3,9,'#3a2c29');}
    ctx.restore();
  }
  function drawStorm(o){ctx.save();ctx.globalAlpha=.42;ctx.fillStyle='#384b6a';ctx.fillRect(o.x-42,o.y-18,84,27);ctx.fillRect(o.x-26,o.y-31,48,27);ctx.fillStyle='#86dcff';ctx.fillRect(o.x-3,o.y+8,7,15);ctx.fillRect(o.x-10,o.y+19,7,10);ctx.restore();}
  function drawTornado(now){
    const r=tornado.radius;ctx.save();ctx.translate(Math.round(tornado.x),Math.round(tornado.y));const t=now*.008;ctx.globalAlpha=.26;ctx.fillStyle=ranks[tornado.rank].color;ctx.fillRect(-r*1.8,-r*1.8,r*3.6,r*3.6);ctx.globalAlpha=1;
    const bands=8+tornado.rank*2;for(let i=0;i<bands;i++){const p=i/(bands-1),width=r*(1.55-p*1.05),y=-r*.95+p*r*1.8,x=Math.sin(t+i*.95)*r*(.22+p*.12);pxRect(x-width/2,y,width,5+(1-p)*4,i%2?'#c9d4dc':'#8295a6');pxRect(x+width*.12,y-3,width*.38,3,'#eef6f7');}
    pxRect(-5,r*.82,10,12,'#697c8b');ctx.restore();
  }
  function draw(now){
    if(state==='map'||state==='charge'||state==='result'){drawGround();return;}drawGround();objects.filter(o=>o.type==='storm').forEach(drawStorm);objects.filter(o=>o.type==='house'||o.type==='tree').forEach(drawObject);objects.filter(o=>o.type!=='house'&&o.type!=='tree'&&o.type!=='storm').forEach(drawObject);particles.forEach(p=>pxRect(p.x,p.y,p.size,p.size,p.color));drawTornado(now);bubbles.forEach(b=>{ctx.font='bold 13px "Chakra Petch"';const tw=ctx.measureText(b.text).width;ctx.globalAlpha=Math.min(1,b.life*2);pxRect(b.x-tw/2-6,b.y-22,tw+12,21,'#f8fbff');ctx.fillStyle='#111827';ctx.fillText(b.text,b.x-tw/2,b.y-7);ctx.globalAlpha=1;});
  }
  function loop(now){const dt=Math.min(.04,(now-last)/1000);last=now;update(dt,now);draw(now);requestAnimationFrame(loop);}requestAnimationFrame(loop);

  $('startBtn').addEventListener('click',beginCharge);$('generateBtn').addEventListener('pointerdown',()=>addCharge());$('micBtn').addEventListener('click',enableMic);$('retryBtn').addEventListener('click',beginCharge);$('mapBtn').addEventListener('click',()=>{state='map';showScreen('map');});
  $('soundBtn').addEventListener('click',e=>{audioOn=!audioOn;e.currentTarget.textContent=audioOn?'🔊 ÂM THANH: BẬT':'🔇 ÂM THANH: TẮT';e.currentTarget.setAttribute('aria-pressed',audioOn);});
  addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='Space'&&state==='charge'){e.preventDefault();addCharge();}});addEventListener('keyup',e=>keys[e.code]=false);
  function mousePos(e){const r=canvas.getBoundingClientRect();mouse.x=(e.clientX-r.left)/r.width*W;mouse.y=(e.clientY-r.top)/r.height*H;}
  canvas.addEventListener('pointerdown',e=>{mousePos(e);mouse.down=true;canvas.setPointerCapture(e.pointerId)});canvas.addEventListener('pointermove',mousePos);canvas.addEventListener('pointerup',()=>mouse.down=false);canvas.addEventListener('pointercancel',()=>mouse.down=false);

  if(document.modelContext?.registerTool){
    const safeRegister=(tool)=>{try{Promise.resolve(document.modelContext.registerTool(tool)).catch(()=>{});}catch(e){}}
    safeRegister({name:'start_windy_creek_run',title:'Bắt đầu Windy Creek',description:'Mở giai đoạn nạp năng lượng 5 giây để bắt đầu một lượt chơi Windy Creek.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async()=>{if(state==='play')throw new Error('Một lượt chơi đang diễn ra.');beginCharge();return{state:'charging',seconds:5};}});
    safeRegister({name:'read_pilot_progress',title:'Xem tiến trình pilot',description:'Đọc checkpoint và kỷ lục đã lưu trên trình duyệt cho Tornado Go BRRR.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:async()=>({bestScore:saved.best||0,totalScore:saved.total||0,runs:saved.runs||0,currentState:state})});
  }
})();
