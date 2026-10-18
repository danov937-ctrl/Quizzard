// Избор на дизайн: новият вид „Приказен залез“ („v2“) е основният.
// ?design=old връща стария вид на това устройство, ?design=new го включва пак.
// Зарежда се в <head>, преди стиловете, за да няма примигване.
(function () {
  var KEY = 'zn-design', want = null;
  try { want = new URLSearchParams(location.search).get('design'); } catch (e) {}
  var saved = null;
  try {
    if (want === 'old') localStorage.setItem(KEY, 'old');
    else if (want === 'new' || want === 'v2') localStorage.removeItem(KEY);
    saved = localStorage.getItem(KEY);
  } catch (e) { saved = want === 'old' ? 'old' : null; }
  if (saved !== 'old' && want !== 'old') document.documentElement.dataset.design = 'v2';
})();
