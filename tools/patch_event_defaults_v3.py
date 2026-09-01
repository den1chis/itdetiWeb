from pathlib import Path

APP = Path("app.html")
MARK = "ITDETI_EVENT_DEFAULTS_V3"

SCRIPT = r'''/* ITDETI_EVENT_DEFAULTS_V3 */
(function(){
  if(window.__itdEventDefaultsV3)return;
  window.__itdEventDefaultsV3=true;

  function pad(n){return String(n).padStart(2,"0")}
  function localInput(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`}
  function nextHour(){const d=new Date();d.setMinutes(0,0,0);d.setHours(d.getHours()+1);return d}
  function plusHour(value){const d=new Date(value);return Number.isNaN(d.getTime())?"":localInput(new Date(d.getTime()+3600000))}

  const originalOpenCalendarItem=window.openCalendarItem;
  if(typeof originalOpenCalendarItem==="function" && !window.__itdCalendarItemWrapped){
    window.__itdCalendarItemWrapped=true;
    window.openCalendarItem=async function(id,type){
      window.__itdEditingCalendarItemId=id;
      return originalOpenCalendarItem(id,type);
    };
  }

  function prepareEventForm(){
    const start=document.querySelector("#eventStart"), end=document.querySelector("#eventEnd");
    if(!start||!end)return;
    const isEditing=!!window.__itdEditingCalendarItemId;
    if(!isEditing && !start.value){const d=nextHour();start.value=localInput(d);end.value=localInput(new Date(d.getTime()+3600000));}
    else if(!end.value && start.value) end.value=plusHour(start.value);
    if(start.dataset.itdEndBound!=="1"){
      start.dataset.itdEndBound="1";
      start.addEventListener("change",()=>{if(!end.dataset.itdEndUserChanged)end.value=plusHour(start.value)});
      end.addEventListener("change",()=>{end.dataset.itdEndUserChanged="1"});
    }
    const item=window.state?.calendar?.items?.find(x=>String(x.item_id)===String(window.__itdEditingCalendarItemId||""));
    const type=document.querySelector("#eventType");
    if(item?.event_type==="masterclass"&&type){
      let option=Array.from(type.options).find(o=>o.value==="masterclass");
      if(!option){option=document.createElement("option");option.value="masterclass";option.textContent="Мастер-класс";type.appendChild(option)}
      type.value="masterclass";type.disabled=true;
    }
  }
  function scan(){if(document.querySelector("#modal.open")&&document.querySelector("#eventStart"))prepareEventForm()}
  new MutationObserver(scan).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
  setTimeout(scan,0);setTimeout(scan,250);setTimeout(scan,800);
})();
'''

def main():
    text=APP.read_text(encoding="utf-8")
    if MARK in text:return
    pos=text.lower().rfind("</body>")
    if pos<0:raise RuntimeError("missing </body>")
    APP.write_text(text[:pos]+"\n<script>\n"+SCRIPT+"\n</script>\n"+text[pos:],encoding="utf-8")
    print("Event defaults v3 applied")
if __name__=="__main__":main()
