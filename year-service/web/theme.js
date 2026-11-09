(() => {
  const colors={night:'#202529',paper:'#f6f3eb',moss:'#ecf0e5'};
  let palette='night';
  try {const saved=localStorage.getItem('aditya-year-palette');if(Object.hasOwn(colors,saved)) palette=saved;} catch {}
  function apply(value) {
    document.documentElement.dataset.palette=value;
    document.querySelector('meta[name="theme-color"]').content=colors[value];
    document.querySelectorAll('.palette button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.palette===value)));
  }
  apply(palette);
  document.addEventListener('DOMContentLoaded',()=>{
    apply(palette);
    document.querySelectorAll('.palette button').forEach(button=>button.addEventListener('click',()=>{
      palette=button.dataset.palette;apply(palette);
      try {localStorage.setItem('aditya-year-palette',palette);} catch {}
    }));
  });
})();
