(async()=>{
  const response=await fetch('moon-beacon-v1.js?v=20260801-2',{cache:'no-store'});
  if(!response.ok)throw new Error(`Unable to load beacon source (${response.status})`);
  let code=await response.text();
  const coreOld='core.scale.y=length;group.add(core);';
  const coreNew='core.scale.y=length;core.position.y=length/2;group.add(core);';
  const waveOld='beam.scale.y=length;layers.push';
  const waveNew='beam.scale.y=length;beam.position.y=length/2;layers.push';
  if(!code.includes(coreOld)||!code.includes(waveOld))throw new Error('Beacon source signature not recognised');
  code=code.replace(coreOld,coreNew).replace(waveOld,waveNew);
  const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
  try{await import(url)}finally{URL.revokeObjectURL(url)}
})().catch(error=>{
  console.error(error);
  const el=document.getElementById('loading');
  if(el)el.innerHTML=`<div class="loader"><h2>Unable to start the celestial beacon</h2><p>${String(error.message||error)}</p><button onclick="location.reload()">Reload</button></div>`;
});
