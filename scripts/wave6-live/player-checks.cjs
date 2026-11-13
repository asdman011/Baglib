const assert = require('node:assert/strict');
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

module.exports = async function verifyControls({ owner, evaluate, until, shot, language, video = false }) {
  const click = selector => evaluate("document.querySelector(" + JSON.stringify(selector) + ").click()");
  const focus = () => evaluate("document.querySelector('[data-lecture-controls]').focus()");
  const key = async (keyCode, modifiers = []) => {
    await focus();
    owner.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    owner.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await pause(120);
  };
  const state = () => evaluate("(()=>{const v=document.querySelector('[data-lecture-player]');return {time:v.currentTime,duration:v.duration,paused:v.paused,rate:v.playbackRate,muted:v.muted,volume:v.volume,native:v.controls}})()");
  const seek = seconds => evaluate("(()=>{const v=document.querySelector('[data-lecture-player]');v.pause();v.currentTime=" + seconds + ";})()");
  const setRange = (selector, value) => evaluate("(()=>{const input=document.querySelector(" + JSON.stringify(selector) + ");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input," + value + ");input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  assert.equal((await state()).native, false);
  await evaluate("document.querySelector('[data-lecture-player]').muted=true");
  await seek(0);
  await click('[data-lecture-play]'); await until("!document.querySelector('[data-lecture-player]').paused");
  await click('[data-lecture-play]'); await until("document.querySelector('[data-lecture-player]').paused");
  await key('k'); assert.equal((await state()).paused, false);
  await key('Space'); assert.equal((await state()).paused, true);
  await seek(0);
  await click('[data-lecture-forward]'); assert.ok(Math.abs((await state()).time - Math.min(10, (await state()).duration)) < 0.4);
  await click('[data-lecture-back]'); assert.ok((await state()).time < 0.4);
  await key('l'); assert.ok(Math.abs((await state()).time - Math.min(10, (await state()).duration)) < 0.4);
  await key('j'); assert.ok((await state()).time < 0.4);
  await key('Right'); assert.ok(Math.abs((await state()).time - Math.min(5, (await state()).duration)) < 0.4);
  await key('Left'); assert.ok((await state()).time < 0.4);
  await setRange('[data-lecture-timeline]', (await state()).duration / 2);
  assert.ok(Math.abs((await state()).time - (await state()).duration / 2) < 0.4);
  assert.equal(await evaluate("document.querySelector('[data-lecture-timeline]').closest('[dir]').dir"), 'ltr');
  const bounds = await evaluate("(()=>{const r=document.querySelector('[data-lecture-timeline]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
  owner.webContents.sendInputEvent({type:'mouseMove',x:Math.floor(bounds.x),y:Math.floor(bounds.y)});
  await until("!!document.querySelector('[data-lecture-hover-time]')");
  owner.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:Math.floor(bounds.x),y:Math.floor(bounds.y)});
  owner.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:Math.floor(bounds.x),y:Math.floor(bounds.y)});
  await pause(100);
  assert.ok(Math.abs((await state()).time - (await state()).duration / 2)<0.5);

  await setRange('[data-lecture-volume]', 0.5); await pause(100); assert.equal((await state()).volume,0.5);
  await key('Up'); assert.ok(Math.abs((await state()).volume-0.55)<0.01);
  await key('Down'); assert.ok(Math.abs((await state()).volume-0.5)<0.01);
  const beforeMute=(await state()).muted;await click('[data-lecture-mute]');assert.equal((await state()).muted,!beforeMute);
  await key('m');assert.equal((await state()).muted,beforeMute);
  await click('[data-lecture-speed-menu] summary'); await click('[data-lecture-speed="1.5"]');
  await until("document.querySelector('[data-lecture-player]').playbackRate===1.5");
  await evaluate("document.querySelector('[data-lecture-controls]').dispatchEvent(new KeyboardEvent('keydown',{key:'>',bubbles:true}))");
  assert.equal((await state()).rate,1.75);
  await evaluate("document.querySelector('[data-lecture-controls]').dispatchEvent(new KeyboardEvent('keydown',{key:'<',bubbles:true}))");
  assert.equal((await state()).rate,1.5);
  await click('[data-lecture-speed-menu] summary');await key('Escape');
  assert.equal(await evaluate("document.querySelector('[data-lecture-speed-menu]').open"),false);
  await click('[data-lecture-fullscreen]');await until("!!document.fullscreenElement");
  assert.equal(await evaluate("document.fullscreenElement.matches('[data-lecture-controls]')"),true);
  await key('f');await until("!document.fullscreenElement");
  await key('f');await until("!!document.fullscreenElement");
  await click('[data-lecture-fullscreen]');await until("!document.fullscreenElement");
  assert.equal(await evaluate("document.querySelector('[data-lecture-captions]').disabled"),true);
  await key('c');assert.equal(await evaluate("document.querySelector('[data-lecture-captions]').getAttribute('aria-pressed')"),'false');
  await evaluate("document.querySelector('[data-lecture-player]').addTextTrack('captions','Test','en')");
  await until("!document.querySelector('[data-lecture-captions]').disabled");
  await key('c');await until("document.querySelector('[data-lecture-captions]').getAttribute('aria-pressed')==='true'");
  await click('[data-lecture-captions]');await until("document.querySelector('[data-lecture-captions]').getAttribute('aria-pressed')==='false'");
  const initialLayout=await evaluate("document.querySelector('[data-lecture-controls]').dataset.lectureLayout");
  if(initialLayout!=='overlay')await click('[data-lecture-layout-switch]');
  if(video){
    await evaluate("(()=>{const v=document.querySelector('[data-lecture-player]');v.muted=true;v.loop=true;v.currentTime=0;v.playbackRate=1;return v.play();})()");
    await pause(2800);
    assert.equal(await evaluate("document.querySelector('[data-lecture-controls]').dataset.controlsVisible"),'false','overlay auto-hides while playing');
    await evaluate("document.querySelector('[data-lecture-controls]').dispatchEvent(new PointerEvent('pointermove',{bubbles:true}))");
    assert.equal(await evaluate("document.querySelector('[data-lecture-controls]').dataset.controlsVisible"),'true');
  }
  await click('[data-lecture-layout-switch]');
  assert.equal(await evaluate("localStorage.getItem('baglib.lectures.layout')"),'study');
  assert.ok(await evaluate("!!document.querySelector('[data-lecture-transcript-slot]')"));
  if(video){await pause(2800);assert.equal(await evaluate("document.querySelector('[data-lecture-controls]').dataset.controlsVisible"),'true');}
  await evaluate("document.querySelector('[data-lecture-player]').pause()");
  for(const layout of ['study','overlay']){
    if(await evaluate("document.querySelector('[data-lecture-controls]').dataset.lectureLayout")!==layout)await click('[data-lecture-layout-switch]');
    for(const width of [1280,480]){
      owner.setContentSize(width,900);await pause(250);
      await evaluate("document.querySelector('[data-lecture-controls]').scrollIntoView({block:'center'})");
      assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),language+'/'+layout+'/'+width);
      await shot('player-'+(video?'video':'audio')+'-'+layout+'-'+language+'-'+width);
    }
  }
  owner.setContentSize(1280,900);
  await click('[data-lecture-layout-switch]');
  const pipAvailable=await evaluate("!!document.querySelector('[data-lecture-pip]')");
  let pip='not available for this media';
  if(video&&pipAvailable){
    await evaluate("document.querySelector('[data-lecture-player]').currentTime=1");
    await click('[data-lecture-pip]');
    await until("!!document.pictureInPictureElement || !!document.querySelector('[data-lecture-control-bar] [role=alert]')");
    if(await evaluate("!!document.pictureInPictureElement")){
      pip='entered and exited';
      await click('[data-lecture-pip]');await until("!document.pictureInPictureElement");
    }else pip='provider rejected request';
  }
  return {mouse:true,keyboard:true,timelineLtr:true,hoverTime:true,volume:true,speed:true,fullscreen:true,layouts:2,widths:[1280,480],autoHide:video,pip,captionsSlot:true};
};
