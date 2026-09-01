from pathlib import Path

APP = Path("app.html")
MARK = "ITDETI_EVENT_DEFAULTS_V2"

SCRIPT = r'''/* ITDETI_EVENT_DEFAULTS_V2 */
(function(){
  if(window.__itdEventDefaultsV2)return;
  window.__itdEventDefaultsV2=true;

  function pad(n){return String(n).padStart(2,"0")}
  function localInput(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`}
  function nextHour(){const d=new Date();d.setMinutes(0,0,0);d.setHours(d.getHours()+1);return d}
  function plusHour(value){const d=new Date(value);return Number.isNaN(d.getTime())?"":localInput(new Date(d.getTime()+3600000))}

  function prepareEventForm(){
    const start=document.querySelector("#eventStart");
    const end=document.querySelector("#eventEnd");
    if(!start||!end)return;

    // New events start at the next full hour and end one hour later.
    if(!start.value){
      const d=nextHour();
      start.value=localInput(d);
      end.value=localInput(new Date(d.getTime()+3600000));
    }else if(!end.value){
      end.value=plusHour(start.value);
    }

    if(start.dataset.itdEndBound!=="1"){
      start.dataset.itdEndBound="1";
      start.addEventListener("change",()=>{
        if(!end.dataset.itdUserChanged || !end.value) end.value=plusHour(start.value);
      });
      end.addEventListener("change",()=>{end.dataset.itdUserChanged="1"});
    }

    // Preserve the masterclass event type when editing a standalone MC.
    const item=window.state?.calendar?.items?.find(x=>String(x.item_id)===String(window.__itdEditingCalendarItemId||""));
    const type=document.querySelector("#eventType");
    if(item?.event_type==="masterclass" && type){
      let option=Array.from(type.options).find(o=>o.value==="masterclass");
      if(!option){option=document.createElement("option");option.value="masterclass";option.textContent="Мастер-класс";type.appendChild(option)}
      type.value="masterclass";
      type.disabled=true;
    }
  }

  function scan(){
    const modal=document.querySelector("#modal.open");
    if(modal && document.querySelector("#eventStart")) prepareEventForm();
  }
  new MutationObserver(scan).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
  document.addEventListener("input",e=>{if(e.target?.id==="eventStart")prepareEventForm()},true);
  setTimeout(scan,0);setTimeout(scan,200);setTimeout(scan,700);
})();
'''

def main():
    text=APP.read_text(encoding="utf-8")
    if MARK in text:
        return
    pos=text.lower().rfind("</body>")
    if pos<0: raise RuntimeError("missing </body>")
    text=text[:pos]+"\n<script>\n"+SCRIPT+"\n</script>\n"+text[pos:]
    APP.write_text(text,encoding="utf-8")
    print("Event defaults v2 applied")

if __name__=="__main__":main()
