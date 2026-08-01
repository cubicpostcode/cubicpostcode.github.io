(async()=>{
  const response=await fetch('moon-beacon-v1.js?v=20260801-4',{cache:'no-store'});
  if(!response.ok)throw new Error(`Unable to load beacon source (${response.status})`);
  let code=await response.text();

  const coreOld='core.scale.y=length;group.add(core);';
  const coreNew='core.scale.y=length;core.position.y=length/2;group.add(core);';
  const waveOld='beam.scale.y=length;layers.push';
  const waveNew='beam.scale.y=length;beam.position.y=length/2;layers.push';
  if(!code.includes(coreOld)||!code.includes(waveOld))throw new Error('Beacon source geometry signature not recognised');
  code=code.replace(coreOld,coreNew).replace(waveOld,waveNew);

  const beamsOld="const sunBeam=createBeam(0xff3b42,'Sun'),moonBeam=createBeam(0x398cff,'Moon');";
  const beamsNew=`const sunBeam=createBeam(0xff3b42,'Sun'),moonBeam=createBeam(0x398cff,'Moon');
    const worldLockMoonBeam=()=>{
      moonBeam.group.position.copy(emitter);
      moonBeam.group.scale.set(1,1,1);
      moonBeam.group.matrixAutoUpdate=true;
      moonBeam.core.material.depthTest=true;
      moonBeam.core.material.depthWrite=false;
      moonBeam.core.renderOrder=0;
      moonBeam.core.frustumCulled=false;
      moonBeam.layers.forEach(({beam,material})=>{
        material.depthTest=true;
        material.depthWrite=false;
        beam.renderOrder=0;
        beam.frustumCulled=false;
      });
      moonBeam.cubes.forEach(cube=>{
        cube.material.depthTest=true;
        cube.material.depthWrite=false;
        cube.renderOrder=0;
      });
      moonBeam.sparkles.forEach(sparkle=>{
        sparkle.material.depthTest=true;
        sparkle.material.depthWrite=false;
        sparkle.renderOrder=0;
      });
      moonSprite.material.depthTest=true;
      moonSprite.material.depthWrite=false;
      moonSprite.renderOrder=0;
      moonBeam.group.userData.worldLocked=true;
      window.__moonBeamWorldLocked=true;
    };
    worldLockMoonBeam();`;
  if(!code.includes(beamsOld))throw new Error('Moon beam creation signature not recognised');
  code=code.replace(beamsOld,beamsNew);

  const directionOld='function setBeamDirection(beam,dir,altitude){beam.direction.copy(dir).normalize();q.setFromUnitVectors(up,beam.direction);beam.group.quaternion.copy(q);';
  const directionNew='function setBeamDirection(beam,dir,altitude){beam.direction.copy(dir).normalize();q.setFromUnitVectors(up,beam.direction);beam.group.position.copy(emitter);beam.group.scale.set(1,1,1);beam.group.quaternion.copy(q);beam.group.updateMatrixWorld(true);';
  if(!code.includes(directionOld))throw new Error('Beam direction signature not recognised');
  code=code.replace(directionOld,directionNew);

  const inputOld="renderer.domElement.addEventListener('pointerdown',interact);renderer.domElement.addEventListener('wheel',interact,{passive:true});controls.addEventListener('start',interact);";
  const inputNew="renderer.domElement.addEventListener('pointerdown',interact);renderer.domElement.addEventListener('pointermove',event=>{if(event.buttons||event.pointerType==='touch')interact()},{passive:true});renderer.domElement.addEventListener('touchstart',interact,{passive:true});renderer.domElement.addEventListener('wheel',interact,{passive:true});controls.addEventListener('start',interact);";
  if(code.includes(inputOld))code=code.replace(inputOld,inputNew);

  const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
  try{await import(url)}finally{URL.revokeObjectURL(url)}
})().catch(error=>{
  console.error(error);
  const el=document.getElementById('loading');
  if(el)el.innerHTML=`<div class="loader"><h2>Unable to start the celestial beacon</h2><p>${String(error.message||error)}</p><button onclick="location.reload()">Reload</button></div>`;
});
