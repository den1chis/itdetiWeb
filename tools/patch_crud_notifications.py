from pathlib import Path
import re

APP = Path("app.html")
MARK = "ITDETI_CRUD_NOTIFICATIONS_V2"
RUNTIME = r'''/* ITDETI_CRUD_NOTIFICATIONS_V2 */
(function(){
    if (window.appNotify) return;
    const style=document.createElement('style');
    style.textContent=`
      .itd-notify-wrap{position:fixed;top:16px;right:16px;z-index:100000;display:grid;gap:8px;width:min(390px,calc(100vw - 24px));pointer-events:none}
      .itd-notify{pointer-events:auto;background:#fff;border:1px solid #e6e8ee;border-radius:13px;box-shadow:0 14px 45px rgba(15,23,42,.16);padding:12px 14px;display:flex;gap:10px;align-items:flex-start;animation:itdNotifyIn .18s ease-out}
      .itd-notify.success{border-left:4px solid #14803a}.itd-notify.error{border-left:4px solid #b42318}.itd-notify.info{border-left:4px solid #4f46e5}.itd-notify.warning{border-left:4px solid #a15c00}
      .itd-notify-title{font-size:13px;font-weight:800}.itd-notify-message{font-size:13px;line-height:1.4;color:#697386;white-space:pre-wrap;margin-top:2px}.itd-notify-close{margin-left:auto;border:0;background:transparent;color:#697386;font-size:18px;line-height:1;padding:0 2px}
      @keyframes itdNotifyIn{from{opacity:0;transform:translateY(-7px)}to{opacity:1;transform:none}}
      @media(max-width:600px){.itd-notify-wrap{top:auto;bottom:calc(12px + env(safe-area-inset-bottom));left:12px;right:12px;width:auto}}
    `;
    document.head.appendChild(style);
    window.appNotify=function(message,type='error',title){
      let wrap=document.querySelector('.itd-notify-wrap');
      if(!wrap){wrap=document.createElement('div');wrap.className='itd-notify-wrap';document.body.appendChild(wrap)}
      const el=document.createElement('div'); el.className=`itd-notify ${type}`;
      const titles={error:'Ошибка',success:'Готово',warning:'Внимание',info:'Информация'};
      el.innerHTML=`<div><div class="itd-notify-title"></div><div class="itd-notify-message"></div></div><button type="button" class="itd-notify-close">×</button>`;
      el.querySelector('.itd-notify-title').textContent=title||titles[type]||'Уведомление';
      el.querySelector('.itd-notify-message').textContent=String(message??'');
      el.querySelector('.itd-notify-close').onclick=()=>el.remove(); wrap.appendChild(el);
      setTimeout(()=>{if(el.isConnected)el.remove()},5000);
    };
})();

async function cleanupStudentBeforeDelete(studentId){
    const lessons=await api(`/lessons?student_id=${encodeURIComponent(studentId)}`);
    for(const lesson of lessons||[]){
        try{await api(`/lessons/${lesson.id}`,{method:'DELETE'});}catch(e){if(!/not found/i.test(String(e.message||'')))throw e;}
    }
    const slots=await api(`/students/${studentId}/schedule?include_inactive=true`);
    for(const slot of slots||[]){
        try{await api(`/students/${studentId}/schedule/${slot.id}`,{method:'DELETE'});}catch(e){if(!/not found/i.test(String(e.message||'')))throw e;}
    }
}

async function createOrReactivateStudentSchedule(path, options){
    try{return await api(path,options)}catch(e){
        if(!/already exists|уже существует/i.test(String(e.message||''))) throw e;
        const m=path.match(/\/students\/([^/]+)\/schedule$/); if(!m) throw e;
        const studentId=m[1]; const p=JSON.parse(options.body||'{}');
        const slots=await api(`/students/${studentId}/schedule?include_inactive=true`);
        const existing=(slots||[]).find(s=>Number(s.day_of_week)===Number(p.day_of_week) && String(s.start_time).slice(0,5)===String(p.start_time).slice(0,5) && String(s.valid_from)===String(p.valid_from));
        if(!existing) throw e;
        return await api(`/students/${studentId}/schedule/${existing.id}`,{method:'PATCH',body:JSON.stringify({...p,is_active:true,valid_until:null})});
    }
}
'''

def function_span(text,name):
    m=re.search(rf'(?m)^(?P<prefix>\s*)(?P<async>async\s+)?function\s+{re.escape(name)}\s*\([^)]*\)\s*\{{',text)
    if not m: raise RuntimeError(f'missing {name}')
    depth=1;i=m.end();quote=None;esc=False
    while i<len(text):
      c=text[i]
      if quote:
        if esc:esc=False
        elif c=='\\':esc=True
        elif c==quote:quote=None
      else:
        if c in "'\"`":quote=c
        elif c=='{':depth+=1
        elif c=='}':
          depth-=1
          if depth==0:return m.start(),i+1
      i+=1
    raise RuntimeError(f'unclosed {name}')

def main():
    text=APP.read_text(encoding='utf-8')
    if MARK not in text:
      pos=text.find('<script>')
      if pos<0:raise RuntimeError('script tag missing')
      text=text[:pos+len('<script>')]+'\n'+RUNTIME+text[pos+len('<script>'):]
    text=re.sub(r'\balert\s*\(', 'appNotify(', text)
    a,b=function_span(text,'itemsForDate')
    fn=text[a:b]
    if '!item.is_cancelled' not in fn:
      fn=fn.replace('item =>\n                dateKey(', 'item =>\n                !item.is_cancelled &&\n                dateKey(',1)
      text=text[:a]+fn+text[b:]
    a,b=function_span(text,'openStudentEditor')
    fn=text[a:b]
    target='await api(\n                        `/students/${student.id}`,\n                        {\n                            method:\n                                "DELETE"\n                        }\n                    );'
    if 'cleanupStudentBeforeDelete(student.id)' not in fn:
      if target not in fn: raise RuntimeError('student delete target missing')
      fn=fn.replace(target,'await cleanupStudentBeforeDelete(student.id);\n\n                    '+target,1)
      text=text[:a]+fn+text[b:]
    a,b=function_span(text,'addStudentSlotEditor')
    fn=text[a:b]
    fn2=fn.replace('await api(\n                    `/students/${currentEditingStudentId()}/schedule`,','await createOrReactivateStudentSchedule(\n                    `/students/${currentEditingStudentId()}/schedule`,',1)
    if fn2==fn: raise RuntimeError('schedule POST target missing')
    text=text[:a]+fn2+text[b:]
    APP.write_text(text,encoding='utf-8')
    print('CRUD/notifications patch applied')

if __name__=='__main__': main()
