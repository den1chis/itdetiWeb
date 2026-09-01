from pathlib import Path

APP = Path("app.html")
MARK = "ITDETI_STANDALONE_MASTERCLASS_V1"

SCRIPT = r'''/* ITDETI_STANDALONE_MASTERCLASS_V1 */
(function(){
  if(window.__itdStandaloneMasterclassInstalled)return;
  window.__itdStandaloneMasterclassInstalled=true;

  const css=`
    .itd-mc-modal{position:fixed;inset:0;z-index:600;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.45);backdrop-filter:blur(2px)}
    .itd-mc-box{width:min(440px,100%);background:#fff;border-radius:18px;box-shadow:0 25px 80px rgba(10,20,40,.2);padding:20px}
    .itd-mc-title{font-size:18px;font-weight:800;margin-bottom:16px}
    .itd-mc-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
    .itd-mc-actions button{border:1px solid var(--border);background:#fff;border-radius:9px;padding:10px 14px}
    .itd-mc-actions .primary{background:var(--primary);color:#fff;border-color:var(--primary)}
    @media(max-width:600px){.itd-mc-modal{align-items:flex-end;padding:10px}.itd-mc-box{margin-bottom:env(safe-area-inset-bottom);border-radius:18px}}
  `;
  const style=document.createElement("style");style.textContent=css;document.head.appendChild(style);

  function nextHour(){const d=new Date();d.setMinutes(0,0,0);d.setHours(d.getHours()+1);return d}
  function localDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
  function localTime(d){return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`}
  function iso(date,time){return new Date(`${date}T${time}:00`).toISOString()}

  window.openStandaloneMasterclass=function(){
    const d=nextHour();
    const overlay=document.createElement("div");overlay.className="itd-mc-modal";
    overlay.innerHTML=`
      <div class="itd-mc-box" role="dialog" aria-modal="true">
        <div class="itd-mc-title">Добавить мастер-класс</div>
        <div class="form">
          <div class="form-group"><label>Имя ребёнка</label><input id="itdMcName" autocomplete="off"></div>
          <div class="form-row">
            <div class="form-group"><label>Дата</label><input id="itdMcDate" type="date" value="${localDate(d)}"></div>
            <div class="form-group"><label>Начало</label><input id="itdMcTime" type="time" value="${localTime(d)}"></div>
          </div>
          <div style="font-size:12px;color:var(--muted)">Продолжительность: 1 час.</div>
          <div class="itd-mc-actions"><button type="button" id="itdMcCancel">Отмена</button><button type="button" class="primary" id="itdMcSave">Добавить</button></div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close=()=>overlay.remove();
    overlay.querySelector("#itdMcCancel").onclick=close;
    overlay.addEventListener("click",e=>{if(e.target===overlay)close()});

    overlay.querySelector("#itdMcSave").onclick=async()=>{
      const name=overlay.querySelector("#itdMcName").value.trim();
      const date=overlay.querySelector("#itdMcDate").value;
      const time=overlay.querySelector("#itdMcTime").value;
      const btn=overlay.querySelector("#itdMcSave");
      if(!name){appNotify("Укажите имя ребёнка.","warning","Не заполнено");overlay.querySelector("#itdMcName").focus();return}
      if(!date||!time){appNotify("Укажите дату и время.","warning","Не заполнено");return}
      btn.disabled=true;
      try{
        const start=iso(date,time);
        const end=new Date(new Date(start).getTime()+3600000).toISOString();
        await api("/events",{method:"POST",body:JSON.stringify({title:`МК — ${name}`,event_type:"masterclass",start_time:start,end_time:end,location:null,notes:`Участник: ${name}`,color:"#d97706"})});
        close();
        await loadCalendar();
        await loadDashboard();
        appNotify("Мастер-класс добавлен.","success");
      }catch(e){appNotify(e.message)}finally{btn.disabled=false}
    };
  };

  function installButton(){
    const lesson=document.querySelector("#addLesson");
    if(!lesson||document.querySelector("#addMasterclass"))return;
    const parent=lesson.parentElement;
    if(!parent)return;
    const b=document.createElement("button");
    b.type="button";b.className="btn";b.id="addMasterclass";b.textContent="+ Мастер-класс";b.onclick=openStandaloneMasterclass;
    parent.insertBefore(b,lesson.nextSibling);
  }

  function hideOldMasterclassOptions(){
    document.querySelectorAll("select").forEach(select=>{
      Array.from(select.options).forEach(option=>{
        if(/мастер[- ]?класс/i.test(option.textContent||""))option.hidden=true;
      });
      if(select.value==="masterclass" && select.id!=="editKind")select.value="lesson";
    });
  }

  function scan(){installButton();hideOldMasterclassOptions()}
  new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
  setTimeout(scan,0);setTimeout(scan,300);setTimeout(scan,1000);
})();
'''

def main():
    text = APP.read_text(encoding="utf-8")
    if MARK in text:
        return
    pos = text.lower().rfind("</body>")
    if pos < 0:
        raise RuntimeError("Could not find </body> in app.html")
    injection = "\n<script>\n" + SCRIPT + "\n</script>\n"
    APP.write_text(text[:pos] + injection + text[pos:], encoding="utf-8")
    print("Standalone masterclass patch applied")

if __name__ == "__main__":
    main()
