// Prima total en Crediopciones Siete Tres y Cinco Cinco: se escribe lo que da el cliente y el cotizador le resta
// los gastos administrativos; lo que sobra es la prima que baja la moto. Las fórmulas del cotizador no cambian:
// solo se le entrega la prima ya sin gastos.
(() => {
  const TOTAL_PLANS = ['siete-tres-47', 'cinco-cinco-47'], KEY = 'tvs-daniel-calc-prima-total';
  let totalMode = true, totalValue = '', lastActive = false, fromApply = false;
  try { totalMode = localStorage.getItem(KEY) !== '0'; } catch {}
  const save = () => { try { localStorage.setItem(KEY, totalMode ? '1' : '0'); } catch {} };
  const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const applies = () => state.financierId === 'crediopciones' && TOTAL_PLANS.includes(state.planId);
  const active = () => totalMode && applies();
  const fee = () => { const plan = getPlan(state.planId), price = Number(state.price); return plan && price > 0 ? round(administrativeFee(plan, price)) : 0; };
  const netAmount = () => { const price = Number(state.price), down = Number(state.down) || 0; return state.downMode === 'percent' ? (price > 0 ? round(price * down / 100) : 0) : down; };

  // Botón «Total» junto a $ y %
  const group = $('down-amount').parentElement, btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'down-total'; btn.textContent = 'Total'; btn.setAttribute('aria-pressed', 'false');
  btn.title = 'Escribí lo que da el cliente; se le restan los gastos administrativos';
  group.append(btn);

  function sync() {
    const now = active();
    if (now && !lastActive) {
      // Al entrar: el campo pasa a mostrar el total (prima + gastos)
      const net = netAmount(); state.downMode = 'amount';
      totalValue = state.down === '' ? '' : String(round(net + fee()));
      setValue($('down'), totalValue);
    } else if (!now && lastActive) {
      // Al salir: el campo vuelve a mostrar la prima sin gastos
      setValue($('down'), state.down);
    } else if (now && fromApply) {
      const net = netAmount(); state.downMode = 'amount';
      totalValue = state.down === '' ? '' : String(round(net + fee()));
      setValue($('down'), totalValue);
    } else if (now) {
      totalValue = $('down').value;
    }
    if (now) {
      state.downMode = 'amount';
      state.down = totalValue === '' ? '' : String(Math.max(0, round(Number(totalValue) - fee())));
    }
    lastActive = now;
  }
  function decorate() {
    const now = active();
    btn.hidden = !applies();
    btn.setAttribute('aria-pressed', String(now));
    if (now) {
      $('down-amount').setAttribute('aria-pressed', 'false'); $('down-percent').setAttribute('aria-pressed', 'false');
      $('down-unit').textContent = '$';
      $('down-label').textContent = 'Prima total que da el cliente';
      $('down').setAttribute('aria-label', 'Prima total que da el cliente, en dólares (incluye los gastos administrativos)');
      const total = Number(totalValue) || 0, f = fee(), net = Number(state.down) || 0, price = Number(state.price);
      $('down-equivalent').textContent = !(price > 0) ? 'Escribí lo que da el cliente; se le restan los gastos administrativos.'
        : total > 0 && total < f ? `No alcanza para los gastos administrativos (${money(f)}).`
        : `Gastos −${money(f)} · prima ${money(net)} (${percent(net / price * 100, 2)}% del precio)`;
    } else {
      $('down-label').textContent = 'Prima';
    }
  }
  const renderBefore = render;
  render = function () { sync(); renderBefore(); decorate(); };

  btn.addEventListener('click', () => { if (totalMode && lastActive) return; totalMode = true; save(); state.touched = true; render(); });
  for (const id of ['down-amount', 'down-percent']) {
    // Al elegir $ o %, se sale de «Total» antes de que el cotizador cambie el formato.
    $(id).addEventListener('click', () => { if (!active()) return; totalMode = false; save(); render(); }, true);
  }
  const apply = window.TVSCalculator.apply;
  window.TVSCalculator.apply = function (values) { fromApply = true; try { return apply.call(this, values); } finally { fromApply = false; render(); } };
})();
