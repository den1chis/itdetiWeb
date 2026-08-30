from pathlib import Path
import re

APP = Path("app.html")
MARK = "ITDETI_CRUD_NOTIFICATIONS_V4"
RUNTIME = r'''/* ITDETI_CRUD_NOTIFICATIONS_V4 */
(function(){
    if (window.appNotify) return;
    const style=document.createElement('style');
    style.textContent=`
      .itd-notify-wrap{position:fixed;top:16px;right:16px;z-index:100000;display:grid;gap:8px;width:min(390px,calc(100vw - 24px));pointer-events:none}
      .itd-notify{pointer-events:auto;background:#fff;border:1px solid #e6e8ee;border-radius:13px;box-shadow:0 14px 45px rgba(15,23,42,.16);padding:12px 14px;display:flex;gap:10px;align-items:flex-start;animation:itdNotifyIn .18s ease-out}
      .itd-notify.success{border-left:4px solid #14803a}.itd-notify.error{border-left:4px solid #b42318}.itd-notify.info{border-left:4px solid #4f46e5}.itd-notify.warning{border-left:4px solid #a15c00}
      .itd-notify-title{font-size:13px;font-weight:800}.itd-notify-message{font-size:13px;line-height:1.4;color:#697386;white-space:pre-wrap;margin-top:2px}.itd-notify-close{margin-left:auto;border:0;background:transparent;color:#697386;font-size:18px;line-height:1;padding:0 2px}
      .itd-field-invalid{border-color:#b42318!important;box-shadow:0 0 0 2px rgba(180,35,24,.08)!important}
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
    window.appValidate=function(fields){
      for(const field of fields||[]){
        const el=typeof field==='string'?document.querySelector(field):field?.el;
        const label=typeof field==='string'?(el?.getAttribute('aria-label')||el?.name||'Поле'):field?.label||'Поле';
        if(!el) continue;
        const value=String(el.value??'').trim();
        if(!value){
          el.classList.add('itd-field-invalid');
          el.focus?.();
          window.appNotify(`Заполните поле «${label}».`,'warning','Не заполнено');
          return false;
        }
        el.classList.remove('itd-field-invalid');
      }
      return true;
    };
})();

async function cleanupStudentBeforeDelete(studentId){ return; }
async function createOrReactivateStudentSchedule(path, options){ return await api(path,options); }
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

def patch_api(text):
    a,b=function_span(text,'api')
    fn=text[a:b]
    pattern=r'''const response\s*=\s*await fetch\(\s*API \+ path,\s*\{\s*\.\.\.options,\s*headers\s*\}\s*\);'''
    repl='''let response;\n\n    try {\n        response = await fetch(API + path, { ...options, headers });\n    } catch (error) {\n        throw new Error("Не удалось связаться с сервером. Проверьте интернет-соединение и доступность сервера.");\n    }'''
    fn2,n=re.subn(pattern,repl,fn,count=1,flags=re.S)
    if n!=1: raise RuntimeError('api fetch block missing')
    return text[:a]+fn2+text[b:]

def patch_student_delete(text):
    a,b=function_span(text,'openStudentEditor')
    fn=text[a:b]
    fn2=fn.replace('await cleanupStudentBeforeDelete(student.id);\n\n                    ','',1)
    if fn2==fn: raise RuntimeError('student cleanup call missing')
    return text[:a]+fn2+text[b:]

def patch_student_validation(text):
    a,b=function_span(text,'openStudentEditor')
    fn=text[a:b]
    needle='''                if (!id) {\n'''
    insert='''                if (!appValidate([\n                    {el: $("#studentName"), label: "Имя ученика"},\n                    {el: $("#studentPrice"), label: "Стоимость занятия"}\n                ])) {\n                    button.disabled = false;\n                    button.textContent = "Сохранить";\n                    return;\n                }\n\n\n'''
    if 'label: "Имя ученика"' not in fn:
        if needle not in fn: raise RuntimeError('student save marker missing')
        fn=fn.replace(needle,insert+needle,1)
        text=text[:a]+fn+text[b:]
    return text

def main():
    text=APP.read_text(encoding='utf-8')
    original=text
    if MARK not in text:
      pos=text.find('<script>')
      if pos<0:raise RuntimeError('script tag missing')
      text=text[:pos+len('<script>')]+'\n'+RUNTIME+text[pos+len('<script>'):]
    text=re.sub(r'\balert\s*\(', 'appNotify(', text)
    text=patch_student_delete(text)
    text=patch_api(text)
    text=patch_student_validation(text)
    a,b=function_span(text,'itemsForDate')
    fn=text[a:b]
    if '!item.is_cancelled' not in fn:
      fn=fn.replace('item =>\n                dateKey(', 'item =>\n                !item.is_cancelled &&\n                dateKey(',1)
      text=text[:a]+fn+text[b:]
    APP.write_text(text,encoding='utf-8')
    print('CRUD, delete lifecycle and notification patch applied' if text!=original else 'CRUD patch already applied')

if __name__=='__main__': main()
