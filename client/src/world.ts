import * as THREE from "three";

export type LayerId = 1 | 2;
export type ItemKind = "relay" | "gate" | "maze" | "checkpoint" | "layer-exit" | "crystal" | "clue" | "cipher" | "finish" | "note" | "orb" | "house-key" | "house-door" | "white-door" | "elevator";
export type FloorRect = { minX:number; maxX:number; minZ:number; maxZ:number; y:number };
export type HazardZone = { id:string; minX:number; maxX:number; minZ:number; maxZ:number; targetX:number; targetZ:number; message:string };
export type WorldItem = {
  id:string; label:string; kind:ItemKind; position:THREE.Vector3; radius:number;
  description:string; object:THREE.Group; blocker?:THREE.Box3; leaf?:THREE.Object3D; digit?:number;
};
export type BuiltWorld = {
  root:THREE.Group; layer:LayerId; colliders:THREE.Box3[]; floors:FloorRect[]; hazards:HazardZone[];
  items:WorldItem[]; spawn:THREE.Vector3; stalker?:THREE.Group;
};

export function buildWorld(layer:LayerId):BuiltWorld {
  const root=new THREE.Group(),colliders:THREE.Box3[]=[],floors:FloorRect[]=[],hazards:HazardZone[]=[],items:WorldItem[]=[];
  const materials=new Map<string,THREE.MeshStandardMaterial>();
  const mat=(c:string,e?:string,i=0.35)=>{
    const k=c+"|"+(e||"")+"|"+i;let m=materials.get(k);
    if(!m){m=new THREE.MeshStandardMaterial({color:c,roughness:0.94,metalness:0.035,emissive:e||"#000000",emissiveIntensity:i});materials.set(k,m);}
    return m;
  };
  const box=(x:number,y:number,z:number,sx:number,sy:number,sz:number,c:string,solid=false,e?:string)=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat(c,e));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);
    if(solid)colliders.push(new THREE.Box3(new THREE.Vector3(x-sx/2,y-sy/2,z-sz/2),new THREE.Vector3(x+sx/2,y+sy/2,z+sz/2)));
    return m;
  };
  const floor=(x:number,z:number,sx:number,sz:number,c:string,y=0)=>{
    box(x,y-0.25,z,sx,0.5,sz,c);floors.push({minX:x-sx/2,maxX:x+sx/2,minZ:z-sz/2,maxZ:z+sz/2,y});
  };
  const lamp=(x:number,y:number,z:number,c:string,p=1.8,r=11)=>{
    const orb=new THREE.Mesh(new THREE.SphereGeometry(0.15,8,8),mat(c,c,1.8));orb.position.set(x,y,z);root.add(orb);
    const light=new THREE.PointLight(c,p,r,1.8);light.position.set(x,y,z);root.add(light);
  };
  const firepit=(id:string,x:number,z:number,targetX:number,targetZ:number)=>{
    const base=new THREE.Mesh(new THREE.CylinderGeometry(1.15,1.32,.16,16),mat("#3a2820","#9e3d1c",.8));
    base.position.set(x,.04,z);root.add(base);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1.05,.095,8,22),mat("#b65b2a","#e15b21",1.5));
    ring.rotation.x=Math.PI/2;ring.position.set(x,.16,z);root.add(ring);
    for(let i=0;i<3;i++){
      const flame=new THREE.Mesh(new THREE.ConeGeometry(.25+i*.04,.9+i*.18,7),mat(i===1?"#ffc46b":"#e65d25",i===1?"#ffae35":"#f04417",1.8));
      flame.position.set(x+(i-1)*.38,.62+(i===1?.12:0),z+(i%2?-.08:.1));root.add(flame);
    }
    lamp(x,1,z,"#f16a28",2.4,7);
    hazards.push({id,minX:x-1.05,maxX:x+1.05,minZ:z-1.05,maxZ:z+1.05,targetX,targetZ,
      message:"The firepit folds space around you and throws you somewhere else."});
  };
  const rock=(x:number,y:number,z:number,sx:number,sy:number,sz:number,c:string)=>{
    const o=new THREE.Mesh(new THREE.DodecahedronGeometry(1,1),mat(c));o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.rotation.y=(x+z)*0.03;o.castShadow=true;root.add(o);
  };
  const tree=(x:number,z:number,s=1)=>{
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.16*s,.27*s,2.7*s,6),mat("#332a21"));trunk.position.set(x,1.35*s,z);root.add(trunk);
    for(let i=0;i<3;i++){const cone=new THREE.Mesh(new THREE.ConeGeometry((1.5-i*.25)*s,2.35*s,7),mat(i===1?"#182720":"#202e24"));cone.position.set(x,(2.5+i*.7)*s,z);root.add(cone);}
  };
  const item=(id:string,label:string,kind:ItemKind,x:number,z:number,color:string,description:string,radius=3,digit?:number,groundY=0)=>{
    const g=new THREE.Group();g.position.set(x,groundY,z);root.add(g);
    let leaf:THREE.Object3D|undefined,blocker:THREE.Box3|undefined;
    if(kind==="gate"||kind==="layer-exit"||kind==="finish"||kind==="house-door"||kind==="white-door"){
      const house=kind==="house-door",white=kind==="white-door",w=house?2.8:white?5.2:kind==="gate"?7:8;
      const height=house?3.1:4,frame=house?"#40352a":white?"#858b83":kind==="gate"?"#51473a":"#36463e",y=groundY+height/2;
      for(const side of [-1,1])box(x+side*w/2,y,z,.55,height,.85,frame,true);
      box(x,y+height/2,z,w+.55,.42,.9,frame,true);
      leaf=box(x,y,z,w-.55,height-.22,.22,house?"#493a2b":white?"#e5e6df":"#101715",false,white?"#ffffff":color);
      if(white){for(let i=0;i<3;i++)box(x-.9+i*.9,groundY+height*.48,z+.14,.23,.23,.05,"#c9d0c9",false,"#eef8eb");}
      else{const seal=new THREE.Mesh(new THREE.OctahedronGeometry(.38),mat(color,color,1.5));seal.position.set(0,height*.52,.25);g.add(seal);}
      const light=new THREE.PointLight(white?"#dbe8df":color,1.2,9);light.position.set(0,height*.55,1);g.add(light);
      blocker=new THREE.Box3(new THREE.Vector3(x-w/2+.2,groundY,z-.28),new THREE.Vector3(x+w/2-.2,groundY+height,z+.28));colliders.push(blocker);
    }else if(kind==="elevator"){
      const platform=new THREE.Mesh(new THREE.BoxGeometry(5.6,.35,5.6),mat("#555b55"));platform.position.y=.18;g.add(platform);
      for(const side of [-1,1]){const rail=new THREE.Mesh(new THREE.BoxGeometry(.18,4,.18),mat("#6d776f"));rail.position.set(side*2.5,2,side*2.5);g.add(rail);}
      const panel=new THREE.Mesh(new THREE.BoxGeometry(.45,1.3,.12),mat("#242d28"));panel.position.set(2.15,1.15,0);g.add(panel);
      const button=new THREE.Mesh(new THREE.SphereGeometry(.12,8,8),mat("#b6dcca","#81dfb6",1.8));button.position.set(2.15,1.35,.09);g.add(button);
      const light=new THREE.PointLight("#8fd2b2",1.2,8);light.position.set(0,2,0);g.add(light);
    }else if(kind==="note"){
      const paper=new THREE.Mesh(new THREE.PlaneGeometry(.82,1.08),mat("#c9c2a6","#5a4c35",.22));paper.position.set(0,1.42,.12);paper.rotation.y=Math.PI;g.add(paper);
      for(let i=0;i<4;i++){const line=new THREE.Mesh(new THREE.BoxGeometry(.48,.018,.015),mat("#625a4a"));line.position.set(0,1.57-i*.13,.14);g.add(line);}
      const light=new THREE.PointLight("#d3c7a2",.18,2);light.position.set(0,1.5,0);g.add(light);
    }else if(kind==="house-key"){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.22,.07,8,16),mat("#c9b37a","#9e7d38",.5));ring.position.set(-.13,1.25,0);g.add(ring);
      const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.7,8),mat("#d3c08a"));shaft.rotation.z=Math.PI/2;shaft.position.set(.25,1.25,0);g.add(shaft);
      const tooth=new THREE.Mesh(new THREE.BoxGeometry(.12,.2,.1),mat("#d3c08a"));tooth.position.set(.45,1.1,0);g.add(tooth);
    }else if(kind==="maze"||kind==="cipher"){
      box(x,.8,z,1.3,1.6,.9,"#232a27",true);
      box(x,1.17,z+.48,.96,.62,.08,kind==="maze"?"#6e9a90":"#76b78a",false,color);
      for(let j=0;j<3;j++)box(x-.25+j*.25,.35,z+.52,.08,.08,.08,"#d18a50",false,"#d18a50");
      const sig=new THREE.Mesh(new THREE.OctahedronGeometry(.25),mat(color,color,1.3));sig.position.set(0,1.65,0);g.add(sig);
      const light=new THREE.PointLight(color,1.1,7);light.position.set(0,1.5,0);g.add(light);
    }else if(kind==="checkpoint"){
      const plinth=new THREE.Mesh(new THREE.CylinderGeometry(.8,.95,.3,8),mat("#383f3c"));plinth.position.y=.15;g.add(plinth);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.72,.085,8,24),mat(color,color,1.5));ring.position.y=1.1;g.add(ring);
      const light=new THREE.PointLight(color,1.4,10);light.position.set(0,1,0);g.add(light);
    }else{
      const plinth=new THREE.Mesh(new THREE.CylinderGeometry(.55,.8,.45,8),mat("#353c38"));plinth.position.y=.22;g.add(plinth);
      const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(kind==="crystal"?.72:.55),mat(color,color,kind==="crystal"?1.9:1.3));crystal.position.y=1.1;crystal.rotation.set(.2,.3,0);g.add(crystal);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.68,.035,6,20),mat(color,color,1));ring.position.y=.82;ring.rotation.x=Math.PI/2;g.add(ring);
      const light=new THREE.PointLight(color,kind==="crystal"?1.7:1.1,9);light.position.set(0,1.4,0);g.add(light);
    }
    const out:WorldItem={id,label,kind,position:new THREE.Vector3(x,groundY+1.2,z),radius,description,object:g,blocker,leaf,digit};
    items.push(out);return out;
  };

  if(layer===1){
    // Mistbound island surface: spawn, house, broken bridge, graveyard, central white door and cave elevator.
    floor(-10,3,42,50,"#3b4435");floor(18,18,18,16,"#394234");
    floor(0,-17,25,25,"#42473a");floor(-18,-25,26,22,"#393f32");
    floor(0,-26,11,8,"#343d32");floor(0,-53,26,12,"#343a31");
    floor(0,-70,17,28,"#222924");floor(0,-87,16,12,"#1d2421");
    const moonA=new THREE.Mesh(new THREE.SphereGeometry(2.1,18,14),new THREE.MeshBasicMaterial({color:"#c9d2ce"}));
    moonA.position.set(-38,29,-68);root.add(moonA);
    const moonB=new THREE.Mesh(new THREE.SphereGeometry(1.1,16,12),new THREE.MeshBasicMaterial({color:"#b3bfc0"}));
    moonB.position.set(35,24,-54);root.add(moonB);
    for(let i=0;i<22;i++){const side=i%2===0?-1:1,x=side*(17+(i%5)*2.1),z=24-Math.floor(i/2)*8.1;rock(x,1.7,z,3.2+(i%2),2.6+(i%3)*.4,4.8,"#50574b");if(i%3===0)tree(side*(14+(i%4)*2),z+2,.72+(i%3)*.1);}
    // Hidden under-terrain alcove on the right, but with an accessible entrance and walkable floor.
    floor(18,4,13,13,"#2b342c",-1.8);rock(18,1.2,-1,7,2.2,7,"#303930");
    rock(12,-.2,4,2.5,1.2,4,"#485044");rock(24,-.2,4,2.5,1.2,4,"#485044");
    for(let i=0;i<9;i++){const z=-8-i*5.4;box(0,.015,z,5.1,.04,3.2,i%2===0?"#534d3e":"#48483b");for(const side of [-1,1])rock(side*(5.3+(i%3)*.5),.48,z,1.8,.7,2.1,"#444c3e");}
    // House shell and locked front door.
    floor(-18,-25,14,15,"#4a4438");
    box(-18,1.65,-17.7,12,.35,.5,"#503f2e");
    box(-24,1.65,-24,.45,3.3,14,"#55432f",true);box(-12,1.65,-24,.45,3.3,14,"#55432f",true);
    box(-18,3.3,-24,12.4,.4,14.6,"#332e24");
    box(-21.5,1.65,-31,3,3.3,.45,"#55432f",true);box(-14.5,1.65,-31,3,3.3,.45,"#55432f",true);
    for(let i=0;i<5;i++)box(-23.7+i*2.85,1.7,-17.1,.08,2.8,.08,"#77583c");
    box(-18,1.15,-22,3.2,.22,1.4,"#5b4630",true);box(-18,1.68,-22,2.2,.85,.12,"#6d4d31");
    const handle=new THREE.Mesh(new THREE.CylinderGeometry(.055,.075,.95,7),mat("#6b4a30"));handle.rotation.z=Math.PI/2;handle.position.set(-17.4,1.85,-22);root.add(handle);
    const axe=new THREE.Mesh(new THREE.BoxGeometry(.44,.24,.12),mat("#8a8e87"));axe.position.set(-17,1.88,-22);root.add(axe);
    // Graveyard with tombstones and a statue overlooking a drop onto the cliff shelf.
    floor(20,-25,18,17,"#373b32");
    for(let i=0;i<8;i++){const x=14+(i%4)*4.2,z=-20-Math.floor(i/4)*5;box(x,.75,z,.72,1.5,.22,"#686d61");box(x,.35,z,.94,.18,.4,"#575d52");}
    const statue=new THREE.Group();statue.position.set(21.2,0,-29);root.add(statue);
    const torso=new THREE.Mesh(new THREE.BoxGeometry(.9,2,.65),mat("#77796d"));torso.position.y=1.1;statue.add(torso);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.43,12,10),mat("#8c8d80"));head.position.y=2.45;statue.add(head);
    for(const side of [-1,1]){const arm=new THREE.Mesh(new THREE.BoxGeometry(.24,1.25,.3),mat("#77796d"));arm.position.set(side*.65,1.35,0);arm.rotation.z=side*.15;statue.add(arm);}
    box(21.2,.8,-30.2,1.2,.45,.45,"#5a5e53");
    floor(21,-41,15,12,"#343b32",-3);
    for(let i=0;i<4;i++)rock(14+i*4.6,-1.7,-35.2-i*.4,2.2,1.1,2.4,"#51584b");
    for(let i=0;i<4;i++)rock(14+(i%2)*13,-2.5,-39-Math.floor(i/2)*4,1.3,.55,1.5,"#5a6055");
    // Narrow bridge, with real gaps and a trowel prop.
    for(let i=0;i<18;i++){const z=-30-i*.95;floor(0,z,4.1,.78,i%4===0?"#373a34":"#655543",.06);box(-2.18,.4,z,.12,.8,.12,"#4e493c");box(2.18,.4,z,.12,.8,.12,"#4e493c");}
    for(const side of [-1,1]){box(side*2.25,.65,-38,.12,1.3,17,"#4b493f");for(let i=0;i<6;i++)box(side*2.25,1.2,-32-i*2.1,.12,.08,.55,"#6e6655");}
    const trowel=new THREE.Mesh(new THREE.BoxGeometry(.16,.08,.78),mat("#777b73"));trowel.position.set(1.1,.23,-36.8);root.add(trowel);
    const trowelHandle=new THREE.Mesh(new THREE.CylinderGeometry(.045,.06,.42,7),mat("#69492e"));trowelHandle.rotation.x=Math.PI/2;trowelHandle.position.set(1.1,.26,-37.35);root.add(trowelHandle);
    // Natural cave walls around a sealed white door; the elevator is inside the cave.
    for(const side of [-1,1]){rock(side*8,1.4,-59,4,2.2,5.5,"#41493e");rock(side*10,3.3,-70,4.5,3,6,"#30382f");rock(side*7.8,3.8,-83,3.4,2.3,5.4,"#242b28");}
    rock(0,6.2,-73,10.2,2,13,"#262d28");rock(-7,3.7,-78,3,2.8,12,"#29312b");rock(7,3.7,-78,3,2.8,12,"#29312b");
    for(let i=0;i<6;i++)box(0,3.9,-74-i*3.1,12,.32,.28,"#414940");
    floor(0,-89,11,9,"#303932");
    for(const x of [-4.1,4.1])box(x,3,-88,.22,6,.22,"#59645b",true);
    for(const x of [-2.8,2.8])box(x,2.4,-89,.16,4,.16,"#69756a");
    for(const z of [-87,-90.5])box(0,2.3,z,5.8,.15,.18,"#69756a");
    lamp(-3,2.5,-79,"#b0c1ad",.7,7);lamp(3,2.5,-86,"#b0c1ad",.7,7);
    // Nine journal notes are physical pickups at the locations described in the notes.
    const notes=[
      ["l1-note-1","Journal note 1",-28,-2,0,"We were all sent in with a week of supplies, with generic gear and one personal keepsake. Some brought photos of loved ones, tools or religious symbols. I brought my journal to keep writing what I witnessed down here."],
      ["l1-note-2","Journal note 2",-26,-35,0,"The air up here makes me lightheaded. I worry if we stay up here for too long, it will run dry. So we set out, light in hand."],
      ["l1-note-3","Journal note 3",0,-36.8,0,"It's a selection process. Regardless of age, everyone has a chance of being sent. One in my group is in a wheelchair and another deaf in both ears. All sick, all inflicted, numbers on our backs."],
      ["l1-note-4","Journal note 4",18,4,-1.8,"The place they placed us was foreign to us all. One island, always misty. We couldn't see anything below the mist, and we certainly didn't want to jump down to find out. The night sky has no star patterns we remember and two moons. We are hopelessly lost."],
      ["l1-note-5","Journal note 5",24,-41,-3,"There are few bodies that return, and fewer places to bury them, lest we be walking on our dead."],
      ["l1-note-6","Journal note 6",9,-49,0,"The news was in calamity. Nobody knew what to do, or who to pray to. It was as if we were abandoned by god."],
      ["l1-note-7","Journal note 7",-18,-22,0,"It was here when we arrived. I'm unsure how the fire remains lit, or where the lamp receives its power, but we're not dismantling it to bring it with us. Where did the wood come from if there were no trees?"],
      ["l1-note-8","Journal note 8",19,-42,-3,"A note that reads: \"The key is buried with the artist.\" It seems it's written with an unusally shaky hand."],
      ["l1-note-9","Journal note 9",-8,-70,0,"It led down, an impossibility they said. But we had no other option. We all entered, holding our breath as the door closed behind us."]
    ] as const;
    for(const [id,label,x,z,y,text] of notes)item(id,label,"note",x,z,"#d6ccb0",text,3,undefined,y);
    item("l1-house-key","House key","house-key",21,-41,"#d8c08a","A brass key lies beside the artist's grave. It fits the house door.",2.3,undefined,-3);
    item("l1-orb-1","Pale orb 1","orb",-10,-3,"#a5d9c0","One of seven pale orbs needed to unlock the white door.",2.6);
    item("l1-orb-2","Pale orb 2","orb",18,3,"#a5d9c0","A pale orb tucked beneath the overhang.",2.6,undefined,-1.8);
    item("l1-orb-3","Pale orb 3","orb",-18,-22,"#a5d9c0","A pale orb resting inside the house.",2.6);
    item("l1-orb-4","Pale orb 4","orb",-.8,-38.7,"#a5d9c0","A pale orb along the broken bridge.",2.5);
    item("l1-orb-5","Pale orb 5","orb",25,-40,"#a5d9c0","A pale orb down on the graveyard cliff.",2.5,undefined,-3);
    item("l1-orb-6","Pale orb 6","orb",8,-50,"#a5d9c0","A pale orb on the rough path below the graveyard.",2.6);
    item("l1-orb-7","Pale orb 7","orb",-8,-55,"#a5d9c0","The last pale orb rests near the cave mouth.",2.6);
    item("l1-house-door","House door","house-door",-18,-31,"#a67a47","Locked. Find the key behind the statue in the graveyard.",2.6);
    item("l1-white-door","White door","white-door",0,-63,"#f0f1e9","Seven pale orbs unlock this white door in the middle of the island.",3.5);
    item("l1-elevator","Cave elevator","elevator",0,-88,"#a6d8bb","Use the elevator to descend to Layer 2.",3.6);
    const stalker=new THREE.Group();stalker.position.set(0,0,-82);root.add(stalker);
    const creature=new THREE.Mesh(new THREE.CapsuleGeometry(.38,1.35,4,8),mat("#080b0b","#101819",.7));creature.position.y=1.05;stalker.add(creature);
    const skull=new THREE.Mesh(new THREE.SphereGeometry(.36,12,10),mat("#050606","#101b1d",.5));skull.position.y=2;stalker.add(skull);
    for(const side of [-1,1]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.065,8,8),mat("#b7e8e6","#7ee8e2",2.2));eye.position.set(side*.14,2.03,-.31);stalker.add(eye);}
    stalker.visible=false;lamp(-8,2,-3,"#e0a65d",.9,9);lamp(4,2,-36,"#ceac79",.65,8);
    return {root,layer,colliders,floors,hazards,items,spawn:new THREE.Vector3(0,1.65,12),stalker};
  }
  floor(0,-13,102,101,"#252a2d");
  const perimeter="#11181b";
  box(-51,3,-14,1,6,103,perimeter,true);box(51,3,-14,1,6,103,perimeter,true);
  box(-28,3,-64,46,6,1,perimeter,true);box(28,3,-64,46,6,1,perimeter,true);
  box(0,3,36,102,6,1,perimeter,true);
  const pyramid=(x:number,z:number,s:number)=>{
    for(let i=0;i<5;i++){const width=(5.7-i*.82)*s,h=.7*s,depth=(5.2-i*.7)*s;box(x,.35*s+i*.7*s,z+i*.52*s,width,h,depth,"#78806b",true);box(x,.35*s+i*.7*s,z+i*.52*s+depth/2+.03,width,.05,.06,"#a4ae91",false,"#45554a");}
    box(x,1.4*s,z+3.2*s,1.8*s,2.8*s,.32,"#101715",false,"#6b8674");
    for(const side of [-1,1])box(x+side*1.25*s,1.7*s,z+3.15*s,.2,3.4*s,.45,"#555d4e",true);
    lamp(x,2.4*s,z+2.85*s,"#d5e7d2",.75,7);
  };
  pyramid(-23,-7,1.1);pyramid(20,-10,1);pyramid(-34,-31,.88);pyramid(32,-32,.92);
  for(let i=0;i<8;i++){const z=25-i*10;rock(-43,1,z,3.3,1.8,4.5,"#38413b");rock(43,1,z-3,3.3,1.8,4.5,"#38413b");}
  for(const x of [-8,8,-39,39])for(let i=0;i<4;i++){box(x,2,-15-i*10,.65,4,.65,"#333d37",true);lamp(x,3.4,-15-i*10,"#9cbda5",.6,6);}
  floor(0,-47,30,8,"#321c1f");
  for(let i=0;i<7;i++)box(-12+i*4,.06,-47,.11,.1,7,"#8f252c",false,"#c32835");
  for(const z of [-44,-50]){lamp(-13,1.4,z,"#d63c3c",1.4,10);lamp(13,1.4,z,"#d63c3c",1.4,10);}
  // These unmistakable ember pads act as the layer's teleport hazards.
  firepit("ember-well-a",-10,-10,25,-28);
  firepit("ember-well-b",10,-25,-30,0);
  firepit("ember-well-c",-30,-45,20,10);
  firepit("ember-well-d",30,-48,-4,-15);
  const crystalPositions:[number,number][]=[[-28,5],[28,7],[-40,-12],[40,-18],[-17,-39],[16,-38],[5,-30]];
  crystalPositions.forEach((p,i)=>item("l2-crystal-"+(i+1),"Pale crystal "+(i+1),"crystal",p[0],p[1],"#9ad7d3","A pale crystal resonates with the chamber. Collect all seven.",2.8));
  item("l2-clue-1","First inscription","clue",-22,-17,"#d9e4c9","FIRST MARK: 2. The first digit is two.",3,2);
  item("l2-clue-2","Second inscription","clue",21,-22,"#d9e4c9","SECOND MARK: 7. The second digit is seven.",3,7);
  item("l2-clue-3","Third inscription","clue",-15,-45,"#d9e4c9","THIRD MARK: 1. The third digit is one.",3,1);
  item("l2-clue-4","Fourth inscription","clue",31,-42,"#d9e4c9","FINAL MARK: 4. The last digit is four.",3,4);
  item("l2-cipher-terminal","Seal terminal","cipher",0,-52,"#9ad7d3","The seal terminal requires seven crystals and the four-digit inscription code.",3.2);
  item("l2-finish-gate","Final gate","finish",0,-60,"#9ed7b9","The final gate opens after the seal terminal accepts the code.",3.5);
  for(let i=0;i<5;i++)box(-2.6+i*1.3,.02,-61,.75,.04,.75,"#7e9388",false,"#47745e");
  const stalker=new THREE.Group();stalker.position.set(0,0,-35);root.add(stalker);
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.62,2.2,5,8),mat("#020404","#152020",.7));body.position.y=1.4;stalker.add(body);
  const face=new THREE.Mesh(new THREE.SphereGeometry(.53,12,10),mat("#010202"));face.position.y=2.7;stalker.add(face);
  for(const side of [-1,1]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.09,8,8),mat("#d4ffed","#86f3ca",2.4));eye.position.set(side*.2,2.72,-.46);stalker.add(eye);}
  stalker.visible=false;lamp(0,4,-32,"#d6eee0",1.3,17);
  return {root,layer,colliders,floors,hazards,items,spawn:new THREE.Vector3(0,1.65,12),stalker};
}
