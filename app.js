// 选址雷达 · 前端。零 API 调用，数据全部来自 web/data/*.json
const TILE = "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=8&x={x}&y={y}&z={z}";
const esc = s => String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
                      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");

const S = { manifest:null, budget:null, city:null, pkg:null, map:null, layers:null, scope:"main" };

// 离线单文件版把数据内嵌在 window.__EMBED__ 里，fetch 会失败（file:// 受 CORS 限制）
function embedData(name){
  if(!window.__EMBED__) return null;
  if(window.__EMBED__[name]) return window.__EMBED__[name];
  try{ const dec = decodeURIComponent(name); if(window.__EMBED__[dec]) return window.__EMBED__[dec]; }catch(e){}
  return null;
}
async function loadJSON(url){
  const key = url.replace("./data/","").split("?")[0].replace(".json","");
  const inlined = embedData(key);
  if(inlined) return inlined;
  // 加时间戳破缓存：静态站被浏览器缓存后，看板会一直显示旧的城市与旧配额
  const r = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now());
  if(!r.ok) throw new Error(url + " → HTTP " + r.status);
  return r.json();
}

function budgetBar(){
  const b = S.budget; if(!b) return;
  const pools = b.pools || [{pool:"amap",desc:"高德",limit:b.limit,used:b.used,
                             remaining:Math.max(0,b.limit-b.used)}];
  // 取最紧张的那个池子做主条，其余在文字里列出
  const tight = pools.slice().sort((x,y)=>(x.remaining/x.limit)-(y.remaining/y.limit))[0];
  const pct = Math.min(100, Math.round(tight.used / tight.limit * 100));
  const bar = document.getElementById("budgetBar");
  bar.innerHTML = `<i style="width:${pct}%"></i>`;
  bar.title = pools.map(p=>`${p.desc}：${p.used}/${p.limit}，剩 ${p.remaining}`).join("\n");
  document.getElementById("scanInfo").textContent = pools
    .map(p=>`${p.desc} ${p.remaining}/${p.limit}`).join("　·　");
}

function renderDecision(){
  const p = S.pkg; const el = document.getElementById("decision");
  if(!p){ el.innerHTML = "<div class='note'>尚未扫描该城市</div>"; return; }
  const c = p.candidates[0] || {};
  const same = p.competitors.filter(x=>x.tier===1).length;
  const sc = c.scores || {};
  el.innerHTML = `
   <div class="cards">
     <div class="card"><b>${p.candidates.length}</b><span>入选点位</span></div>
     <div class="card"><b>${same}</b><span>同模型竞品（全城）</span></div>
     <div class="card"><b>${p.hotspots.length}</b><span>热点商圈</span></div>
     <div class="card"><b>${p.poi_counts.youth}</b><span>青年锚点</span></div>
   </div>
   <div class="note"><b>首推</b>　${esc(c.zone||"-")}
     ｜青年分 ${sc.raw_youth??"-"}｜高净值 ${sc.raw_wealth??"-"}｜热点系数 ${sc.hotspot??"-"}｜综合 ${sc.total??"-"}
     <br>500m 竞品 ${c.competitors?c.competitors["500"].n:"-"}（同模型 ${c.competitors?c.competitors["500"].same:"-"}）
     ｜800m ${c.competitors?c.competitors["800"].n:"-"}｜1km ${c.competitors?c.competitors["1000"].n:"-"}
     ｜租金 ${c.rent?c.rent.low+"~"+c.rent.high+" 元/㎡·天":"-"}（${c.rent?c.rent.basis:"-"}）
     ｜稳态回本 ${c.finance?c.finance.steady:"-"} 月 / 首年实销 ${c.finance?c.finance.real:"-"} 月
     <br><span class="small">${esc((c.risks||[]).join("；"))}</span></div>
   <h3>候选前三</h3>
   ${p.candidates.slice(0,3).map(r=>`<div class="stage"><h4>#${r.rank} ${esc(r.zone||"")}</h4>
     <div class="small">青年 ${r.scores.raw_youth}（办公 ${r.youth.office}/公寓 ${r.youth.apartment}）｜
       竞品 500m ${r.competitors["500"].n} / 800m ${r.competitors["800"].n} / 1km ${r.competitors["1000"].n}｜
       同模型 ${r.competitors["800"].same}｜租金 ${r.rent?r.rent.low+"~"+r.rent.high:"-"}｜
       稳态 ${r.finance?r.finance.steady:"-"} 月 / 实销 ${r.finance?r.finance.real:"-"} 月</div></div>`).join("")}`;
}

function renderVisit(){
  // 看场清单：每城一份。结构对齐 12_城市选址_嘉兴瑞安/00_速览/慈溪看场清单.md
  // 关键数字 → 看场顺序（三站）→ 明确不去的
  const p = S.pkg; const el = document.getElementById("visit");
  if(!p){ el.innerHTML = "<div class='note'>尚未扫描该城市</div>"; return; }
  const same = p.competitors.filter(x=>x.tier===1).length;
  const cands = p.candidates || [];
  const top = cands.slice(0,3);
  const skip = cands.filter(r=>r.competitors["500"].n>=3 || r.competitors["800"].same>=2);
  const sum = cands[0] ? cands[0].scores.raw_youth : 0;

  const num = (r)=>`青年 ${r.scores.raw_youth}（办公 ${r.youth.office}/公寓 ${r.youth.apartment}）｜
     竞品 500m ${r.competitors["500"].n} / 800m ${r.competitors["800"].n} / 1km ${r.competitors["1000"].n}｜
     同模型 ${r.competitors["800"].same}｜租金 ${r.rent?r.rent.low+"~"+r.rent.high:"-"} 元/㎡·天`;

  const station = (r,i)=>{
    const names = ["第一站","第二站","第三站（备选）"];
    const rows = (r.youth.items||[]).slice(0,6).map(it=>{
      const kw = (it.kw||"").split().pop();
      const biz = {"写字楼":"办公锚点","产业园":"产业园","科技园":"科技园","公寓":"公寓",
                   "中学":"中学","大学":"大学","商务中心":"商务中心","商务楼":"商务楼"}[kw] || kw;
      return `<tr><td><b>${esc(it.name)}</b></td><td class="small">${esc(it.addr||"（腾讯未给地址）")}</td>
        <td class="small">${esc(biz)}</td><td class="small">${esc(r.zone||"")}一带</td></tr>`;
    }).join("");
    const checks = (r.checks||[]).map(c=>`<li>${esc(c)}</li>`).join("");
    // 同一片区可能有两个候选点（光看镇街分不出来），加地标副标题区分
    const anchor = (r.youth.items||[])[0];
    const sub = anchor ? anchor.name : "";
    return `<div class="stage">
      <h4>${esc(names[i]||("第"+(i+1)+"站"))}　${esc(r.zone||"-")}
        ${sub?`<span class="small">· ${esc(sub)}一带</span>`:""}
        <span class="small">（${r.lon.toFixed(5)}, ${r.lat.toFixed(5)}）</span></h4>
      <div class="small">${num(r)}<br>${esc((r.risks||[]).join("；"))}</div>
      <table><thead><tr><th>去看哪</th><th>地址</th><th>情况</th><th>备注</th></tr></thead>
        <tbody>${rows}</tbody></table>
      ${checks?`<div class="small"><b>现场核验：</b><ul>${checks}</ul></div>`:""}
    </div>`;
  };

  const skipRows = skip.slice(0,8).map(r=>`<tr>
      <td><b>${esc(r.zone||"")}</b></td><td class="small">${r.lon.toFixed(5)}, ${r.lat.toFixed(5)}</td>
      <td class="small">${esc((r.risks||[]).join("；"))}</td>
      <td class="num">${r.competitors["500"].n} / ${r.competitors["800"].same}</td></tr>`).join("");

  el.innerHTML = `
   <div class="cards">
     <div class="card"><b>${p.competitors.length}</b><span>健身馆总数</span></div>
     <div class="card"><b>${same}</b><span>同模型竞品</span></div>
     <div class="card"><b>${p.poi_counts.youth}</b><span>青年锚点</span></div>
     <div class="card"><b>${p.poi_counts.wealth}</b><span>高净值载体</span></div>
     <div class="card"><b>${p.hotspots.length}</b><span>热点商圈</span></div>
   </div>
   <div class="note">
     <b>${esc(S.city)} 看场清单</b>　数据口径：腾讯地点搜索，跨县过滤后按本县 adcode 归集；
     青年/财富/热点每关键词截到 4 页（跨县同口径），竞品抓全深度。
     租金与回本月数来自实价库，<b>没有样本的城市显示的是估算占位值</b>，落地前必须逐个实探报价。
     <br><button id="exportVisit">导出看场清单（Markdown）</button>
   </div>
   <h3>看场顺序</h3>
   ${top.length? top.map((r,i)=>station(r,i)).join("")
     : "<div class='note'>这个城没有候选点位</div>"}
   <h3>明确不去的</h3>
   ${skipRows? `<table><thead><tr><th>点位</th><th>坐标</th><th>为什么不去</th>
      <th class="num">500m竞品/800m同模</th></tr></thead><tbody>${skipRows}</tbody></table>
      <div class="small">共 ${skip.length} 个点位被排除（500m 内 ≥3 家健身，或 800m 内 ≥2 个同模型品牌）</div>`
     : "<div class='note'>没有明显该排除的点位</div>"}
   <h3>全部候选点（${cands.length} 个）</h3>
   <table><thead><tr><th>#</th><th>片区</th><th class="num">青年</th><th class="num">高净值</th>
     <th class="num">竞品5/8/1k</th><th class="num">同模800</th><th>风险</th></tr></thead><tbody>
     ${cands.map(r=>`<tr><td>${r.rank}</td><td><b>${esc(r.zone||"")}</b></td>
       <td class="num">${r.scores.raw_youth}</td><td class="num">${r.scores.raw_wealth}</td>
       <td class="num">${r.competitors["500"].n}/${r.competitors["800"].n}/${r.competitors["1000"].n}</td>
       <td class="num ${r.competitors["800"].same===0?"good":"warn"}">${r.competitors["800"].same}</td>
       <td class="small">${esc((r.risks||[]).join("；"))}</td></tr>`).join("")}
     </tbody></table>`;

  const btn = document.getElementById("exportVisit");
  if(btn) btn.onclick = ()=>exportVisitMD();
}

function exportVisitMD(){
  const md = visitMD();
  if(!md) return;
  const blob = new Blob([md], {type:"text/markdown;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = S.city + "_看场清单.md";
  a.click();
  URL.revokeObjectURL(a.href);
}

function visitMD(){
  const p = S.pkg; if(!p) return "";
  const same = p.competitors.filter(x=>x.tier===1).length;
  const cands = p.candidates||[];
  const skip = cands.filter(r=>r.competitors["500"].n>=3 || r.competitors["800"].same>=2);
  const names = ["第一站","第二站","第三站（备选）"];
  let md = `# ${S.city} · 看场清单\n\n> 淬练 TEMPER · 24h 智能健身 · 生成于 ${new Date().toLocaleString("zh-CN")}\n\n`;
  md += `## 〇、先记住这几个数\n\n| | |\n|---|---|\n`;
  md += `| **健身馆总数** | ${p.competitors.length} 家 |\n`;
  md += `| **同模型竞品** | ${same} 家 |\n`;
  md += `| **青年锚点** | ${p.poi_counts.youth} 个 |\n`;
  md += `| **高净值载体** | ${p.poi_counts.wealth} 个 |\n`;
  md += `| **热点商圈** | ${p.hotspots.length} 个 |\n\n`;
  md += `## 一、看场顺序\n\n`;
  cands.slice(0,3).forEach((r,i)=>{
    md += `### ${names[i]||("第"+(i+1)+"站")}：${r.zone||"-"}\n\n`;
    md += `坐标 ${r.lon.toFixed(5)}, ${r.lat.toFixed(5)}｜青年 ${r.scores.raw_youth}（办公 ${r.youth.office}/公寓 ${r.youth.apartment}）｜竞品 500m ${r.competitors["500"].n} / 800m ${r.competitors["800"].n} / 1km ${r.competitors["1000"].n}｜同模型 ${r.competitors["800"].same}｜租金 ${r.rent?r.rent.low+"~"+r.rent.high+" 元/㎡·天":"-"}（${r.rent?r.rent.basis:"无"}）\n\n`;
    md += `| 去看哪 | 地址 | 情况 |\n|---|---|---|\n`;
    (r.youth.items||[]).slice(0,6).forEach(it=>{
      md += `| **${it.name}** | ${it.addr||"（腾讯未给地址）"} | ${(it.kw||"").split().pop()} |\n`;
    });
    if((r.checks||[]).length){
      md += `\n**现场核验**\n\n`;
      (r.checks||[]).forEach(c=>{ md += `- ${c}\n`; });
    }
    md += `\n`;
  });
  md += `## 二、明确不去的\n\n`;
  if(skip.length){
    md += `| 点位 | 坐标 | 为什么不去 | 500m竞品/800m同模 |\n|---|---|---|---|\n`;
    skip.slice(0,8).forEach(r=>{
      md += `| **${r.zone||""}** | ${r.lon.toFixed(5)}, ${r.lat.toFixed(5)} | ${(r.risks||[]).join("；")} | ${r.competitors["500"].n} / ${r.competitors["800"].same} |\n`;
    });
    md += `\n共 ${skip.length} 个点位被排除。\n`;
  } else {
    md += `没有明显该排除的点位。\n`;
  }
  md += `\n---\n\n*数据源：腾讯地点搜索；租金与回本来自实价库，无样本的城市显示估算占位值，落地前必须实探报价。*\n`;
  return md;
}

function renderRank(){
  const p = S.pkg; const el = document.getElementById("rank");
  if(!p){ el.innerHTML = "<div class='note'>尚未扫描该城市</div>"; return; }
  const rows = p.candidates.map(r=>`<tr>
    <td>${r.rank}</td><td><b>${esc(r.zone||"")}</b></td>
    <td class="num">${r.scores.raw_youth}</td><td class="num">${r.scores.raw_wealth}</td>
    <td class="num">${r.scores.hotspot}</td><td class="num">${r.scores.total}</td>
    <td class="num">${r.competitors["500"].n}/${r.competitors["800"].n}/${r.competitors["1000"].n}</td>
    <td class="num ${r.competitors["800"].same===0?"good":"warn"}">${r.competitors["800"].same}</td>
    <td class="num">${r.rent?r.rent.low+"~"+r.rent.high:"-"}</td>
    <td class="num">${r.finance?r.finance.steady:"-"}</td>
    <td class="num ${r.finance&&r.finance.real<=12?"good":"warn"}">${r.finance?r.finance.real:"-"}</td>
    <td class="small">${esc((r.risks||[]).join("；"))}</td></tr>`).join("");
  el.innerHTML = `<table><thead><tr><th>#</th><th>片区</th><th class="num">青年</th><th class="num">高净值</th>
    <th class="num">热点</th><th class="num">综合</th><th class="num">竞品5/8/1k</th><th class="num">同模</th>
    <th class="num">租金区间</th><th class="num">稳态回本</th><th class="num">实销回本</th><th>风险</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function initMap(){
  if(S.map) return;
  S.map = L.map("mapCanvas",{zoomControl:true}).setView([30.18,121.26],11);
  S.map.invalidateSize();
  L.tileLayer(TILE,{subdomains:["1","2","3","4"],maxZoom:18,attribution:"高德地图"}).addTo(S.map);
  S.layers = L.layerGroup().addTo(S.map);
  document.getElementById("legend").innerHTML =
    `<span><i style="background:#2f6fd0"></i>青年锚点</span>` +
    `<span><i style="background:#f2c14e"></i>高净值载体</span>` +
    `<span><i style="background:#b06fd6"></i>热点商圈</span>` +
    `<span><i style="background:#9aa0a6"></i>异模型竞品</span>` +
    `<span><i style="background:#d1342f"></i>同模型竞品</span>` +
    `<span><i style="background:#1f9d55"></i>入选候选点</span>`;
}

function renderMap(){
  const p = S.pkg; if(!p) return;
  initMap();
  S.layers.clearLayers();
  const put = (arr,color,r,fill,pop,extra)=>arr.forEach(x=>{
    if(x.lat==null||x.lon==null) return;
    L.circleMarker([x.lat,x.lon],Object.assign({radius:r,color:color,weight:1.5,
      fillColor:fill,fillOpacity:0.9},extra||{})).bindPopup(pop(x)).addTo(S.layers);
  });
  put(p.youths || [],"#2f6fd0",2.5,"#2f6fd0",
      x=>`<b>${esc(x.name)}</b><br><span style="color:#888">${esc(x.kw||"")} ${esc(x.town||"")}</span>`);
  put(p.wealth || [],"#f2c14e",4.5,"#f2c14e",
      x=>`<b>${esc(x.name)}</b><br><span style="color:#888">${esc(x.label||"")}</span>`);
  put(p.competitors,"#9aa0a6",3,"#9aa0a6",x=>`<b>${esc(x.name)}</b><br><span style="color:#888">${esc(x.addr||"")}</span>`);
  put(p.competitors.filter(x=>x.tier===1),"#d1342f",6.5,"#d1342f",
      x=>`<b>同模型竞品</b><br>${esc(x.name)}<br><span style="color:#888">${esc(x.addr||"")}</span>`,
      {weight:2});
  p.hotspots.forEach(h=>{
    L.circleMarker([h.lat,h.lon],{radius:5,color:"#b06fd6",weight:2,fillColor:"#b06fd6",fillOpacity:0.85})
     .bindPopup(`<b>${esc(h.name)}</b><br><span style="color:#888">${esc(h.note||"")}</span>`).addTo(S.layers);
  });
  p.candidates.slice(0,20).forEach(r=>{
    L.marker([r.lat,r.lon],{icon:L.divIcon({className:"mkr",
      html:`<div class="marker"><span>${r.rank}</span></div>`,iconSize:[24,24],iconAnchor:[12,24]})})
     .bindPopup(`<b>#${r.rank} ${esc(r.zone||"")}</b><br>青年 ${r.scores.raw_youth}｜竞品 500m ${r.competitors["500"].n}｜同模 ${r.competitors["800"].same}<br>租金 ${r.rent?r.rent.low+"~"+r.rent.high:"-"}<br>${esc((r.risks||[]).join("；"))}`)
     .addTo(S.layers);
  });
  fitMap();
}

function fitMap(){
  if(!S.map || !S.pkg) return;
  S.map.invalidateSize();
  const b = L.latLngBounds([]);
  S.pkg.candidates.slice(0,20).forEach(c=>b.extend([c.lat,c.lon]));
  if(b.isValid()) S.map.fitBounds(b,{padding:[70,70],maxZoom:14,animate:false});
}

function renderField(){
  const p = S.pkg; const el = document.getElementById("field");
  if(!p){ el.innerHTML = "<div class='note'>尚未扫描该城市</div>"; return; }
  const KEY = "radar_field_"+p.city;
  const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
  const stages = p.candidates.slice(0,6).map(r=>{
    const k = String(r.rank);
    const s = saved[k] || {};
    const checks = (r.checks||[]).map((c,i)=>
      `<label><input type="checkbox" data-k="${k}" data-i="${i}" ${s.done&&s.done[i]?"checked":""}> ${esc(c)}</label>`).join("<br>");
    const nav = `https://uri.amap.com/search?keyword=${encodeURIComponent(r.youth.items[0]?r.youth.items[0].name:r.zone||"")}&city=${encodeURIComponent(p.city)}`;
    return `<div class="stage"><h4>#${r.rank} ${esc(r.zone||"")}</h4>
      <div class="small">坐标 ${r.lon}, ${r.lat}｜竞品 500m ${r.competitors["500"].n}（同模 ${r.competitors["500"].same}）
        ｜租金 ${r.rent?r.rent.low+"~"+r.rent.high+"（"+r.rent.basis+"）":"-"}
        ｜稳态回本 ${r.finance?r.finance.steady:"-"} 月 / 实销 ${r.finance?r.finance.real:"-"} 月</div>
      <div style="margin:8px 0">${checks}</div>
      <div>现场实价 <input type="number" step="0.01" placeholder="元/㎡·天" data-price="${k}" value="${s.price||""}">
        <span class="small">｜${esc((r.risks||[]).join("；"))}</span></div>
      <div style="margin-top:6px"><a href="${nav}" target="_blank">高德导航搜索 →</a></div></div>`;
  }).join("");
  el.innerHTML = `<div class="note">勾选与填价存在本机浏览器；填完点「导出现场记录」拿到 JSON，
    把里面的 samples 追加进 <code>data/rent_db.json</code> 再重跑迁移脚本，估算区间就会用新样本重算。<br>
    <button id="expBtn">导出现场记录</button> <button id="clrBtn">清空本城记录</button></div>${stages}`;
  el.querySelectorAll("input[data-price]").forEach(i=>{ i.onchange = save; });
  el.querySelectorAll("input[data-k]").forEach(i=>{ i.onchange = save; });
  document.getElementById("expBtn").onclick = exportField;
  document.getElementById("clrBtn").onclick = ()=>{ localStorage.removeItem(KEY); renderField(); };

  function save(){
    const st = JSON.parse(localStorage.getItem(KEY) || "{}");
    el.querySelectorAll("input[data-k]").forEach(cb=>{
      const k = cb.dataset.k; st[k] = st[k] || {done:[]};
      st[k].done[+cb.dataset.i] = cb.checked;
    });
    el.querySelectorAll("input[data-price]").forEach(inp=>{
      const k = inp.dataset.price; st[k] = st[k] || {done:[]};
      st[k].price = inp.value ? +inp.value : null;
    });
    localStorage.setItem(KEY, JSON.stringify(st));
  }
  function exportField(){
    const st = JSON.parse(localStorage.getItem(KEY) || "{}");
    const out = {city:p.city, exported_at:new Date().toISOString(), samples:[]};
    Object.entries(st).forEach(([k,v])=>{
      if(v.price){
        const c = p.candidates.find(x=>String(x.rank)===k);
        out.samples.push({city:p.city, level:p.level, bldg_type:"甲级写字楼",
          area:500, unit:+v.price, source:"现场实访 "+(c?c.zone:""),
          date:new Date().toISOString().slice(0,10)});
      }
    });
    const blob = new Blob([JSON.stringify(out,null,1)],{type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "radar_field_"+p.city+".json";
    a.click();
  }
}

async function renderCounty(){
  const el = document.getElementById("county");
  let d;
  try { d = await loadJSON("./county_rank.json"); }
  catch(e){ el.innerHTML = "<div class='note'>优选榜还没生成，先跑 python3 scripts/rank_counties.py</div>"; return; }
  const C = d.counties || [];
  // 租金/回本只有在实价库有样本时才是真数；没有样本时显示估算，别让占位数字
  // 看起来像 61 个县的财务结论一样
  const hasRent = r => r.rent_basis && r.rent_basis.indexOf("无样本") < 0;
  el.innerHTML = `<div class="note"><b>跨县可比</b>：每个指标先在本市内转成分位数再相乘 ——
    <b>√(青年分位 × 消费力分位) × 热点系数 × 竞品真空系数</b>。
    这样「在本地算很突出」和「全国都算突出」能放在一张表里比。<br>
    <b>租金与回本</b>：实价库只覆盖慈溪/瑞安/嘉兴三城，本表 ${C.length} 个县<b>全部没有租金样本</b>，
    租金区间与回本月数都是按默认档位估的<b>占位值，不是各县的真实财务结论</b> —— 落地前必须逐个实探报价。
    <br>生成于 ${esc(d.generated_at||"")}｜${d.n_counties} 个县 / ${d.n_candidates} 个候选点</div>
    <table><thead><tr><th>#</th><th>县</th><th>最优点位</th><th class="num">综合分</th>
    <th class="num">青年(分位)</th><th class="num">高净值(分位)</th><th class="num">500m竞品</th>
    <th class="num">800m同模型</th><th class="num">同模型(全县/区)</th><th class="num">租金区间</th>
    <th class="num">稳态/实销</th><th>关键载体</th></tr></thead><tbody>
    ${C.map((r,i)=>`<tr><td>${i+1}</td><td><b>${esc(r.city)}</b></td><td>${esc(r.zone)}</td>
      <td class="num"><b>${r.score.toFixed(3)}</b></td>
      <td class="num">${r.youth} (${Math.round(r.youth_pct*100)}%)</td>
      <td class="num">${r.wealth} (${Math.round(r.wealth_pct*100)}%)</td>
      <td class="num ${r.comp500===0?"good":""}">${r.comp500}</td>
      <td class="num ${r.same800===0?"good":"warn"}">${r.same800}</td>
      <td class="num">${r.city_same_total}</td>
      <td class="num ${hasRent(r)?"":"dim"}">${hasRent(r)?r.rent_low+"~"+r.rent_high:"估算"}</td>
      <td class="num ${hasRent(r)?"":"dim"}">${hasRent(r)?r.steady+"/"+r.real:"估算"}</td>
      <td class="small gold">${esc(r.lux_names||r.youth_names||"")}</td></tr>`).join("")}
    </tbody></table>`;
}

async function loadCity(name){
  S.city = name;
  S.pkg = await loadJSON("./data/"+encodeURIComponent(name)+".json");
  renderDecision(); renderVisit(); renderRank(); renderField();
  if(S.map) renderMap();
}

async function boot(){
  S.manifest = await loadJSON("./data/manifest.json");
  S.budget = await loadJSON("./data/budget.json");
  const sel = document.getElementById("citySel");
  sel.innerHTML = S.manifest.cities.map(c=>`<option value="${c.city}">${c.city}</option>`).join("");
  sel.onchange = ()=>loadCity(sel.value);
  document.querySelectorAll("nav button").forEach(b=>{
    b.onclick = ()=>{
      document.querySelectorAll("nav button").forEach(x=>x.classList.remove("on"));
      b.classList.add("on");
      ["decision","visit","rank","map","field","county"].forEach(t=>
        document.getElementById(t).classList.toggle("hide", t!==b.dataset.t));
      if(b.dataset.t==="map"){ initMap(); renderMap(); }
      if(b.dataset.t==="field"){ renderField(); }
      if(b.dataset.t==="county"){ renderCounty(); }
    };
  });
  budgetBar();
  await loadCity(S.manifest.cities[0].city);
  renderCounty();
}

window.RADAR = { state:S, loadCity, fitMap, budgetBar, visitMD, renderVisit };
boot().catch(e=>{
  document.getElementById("decision").innerHTML =
    `<div class="note">加载失败：${esc(e.message)}</div>`;
});
