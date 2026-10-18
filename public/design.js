// Избор на дизайн: новият вид („v2“) се включва с ?design=new и се помни на това устройство.
// ?design=old връща стария. Зарежда се в <head>, преди стиловете, за да няма примигване.
(function () {
  var KEY = 'zn-design', want = null;
  try { want = new URLSearchParams(location.search).get('design'); } catch (e) {}
  var saved = null;
  try {
    if (want === 'new' || want === 'v2') localStorage.setItem(KEY, 'v2');
    else if (want === 'old') localStorage.removeItem(KEY);
    saved = localStorage.getItem(KEY);
  } catch (e) { saved = (want === 'new' || want === 'v2') ? 'v2' : null; }
  if (saved === 'v2') document.documentElement.dataset.design = 'v2';
})();
