// Keep this greeting's animated word and its translations together.
export const tailGreetingUi=[
 ['my','माझ्या','我的'],
 ['tail','शेपटीने','尾巴'],
 ['saw you first','तुला आधी पाहिलं','先看到你了']
];
export function tailGreeting(language='en'){
 const column=language==='mr'?1:language==='zh-TW'?2:0;
 const [my,tail,first]=tailGreetingUi.map(parts=>parts[column]);
 const gap=language==='zh-TW'?'':' ';
 return `<span class="pb-tail-line" translate="no">${my}${gap}<span class="pb-tail-word">${tail}</span>${gap}${first}</span>`;
}
