const mensajeOriginal = $("Inyectar Conversión Pesos").first().json.menssaje_final_cadena;
let items = $input.all();
if (items.length === 0) {
  items = [{ json: {} }];
}
const output = items.map(item => {
  const msg = (mensajeOriginal || '').toLowerCase().trim();
  let categoria = 'comercial';
  let respuestaFija = '';
  let nombrePersona = '';
  let autoConsultado = '';

  const catalogoMLRegex = /tengo algunas preguntas sobre (.+?)(?:\.|https?:\/\/|$)/i;
  const matchML = mensajeOriginal.match(catalogoMLRegex);

  const compraKeywords = [
    'compran', 'compras', 'les interesa', 'te interesa', 'toman', 'tomas',
    'propiedad', 'lote', 'permuta', 'vendes', 'vender'
  ];
  const esCompra = compraKeywords.some(kw => msg.includes(kw));

  const cuotasKeywords = [
    'simulacion de cuotas', 'simulación de cuotas',
    'simular cuotas', 'cuántas cuotas', 'cuantas cuotas',
    'en cuotas', 'quiero cuotas', 'pagar en cuotas',
    'cuotas'
  ];
  const esCuotas = cuotasKeywords.some(kw => msg.includes(kw));

  const financiacionKeywords = [
    'formas de pago', 'forma de pago', 'medios de pago',
    'medio de pago', 'cómo puedo pagar', 'como puedo pagar',
    'opciones de financiacion', 'opciones de financiación',
    'financiacion', 'financiación', 'anticipo',
    'aceptan tarjeta', 'aceptan transferencia',
    'pago en efectivo', 'cómo se paga', 'como se paga'
  ];
  const esFinanciacion = financiacionKeywords.some(kw => msg.includes(kw));

  // ─────────────────────────────
  // 1️⃣ CASO COMBINADO: ML + FINANCIACIÓN (prioridad máxima)
  // ─────────────────────────────
  if (matchML && esFinanciacion) {
    categoria = 'catalogo_ml_financiacion';
    autoConsultado = matchML[1].trim();
  }

  // ─────────────────────────────
  // 2️⃣ CATÁLOGO ML SOLO
  // ─────────────────────────────
  else if (matchML) {
    categoria = 'catalogo_ml';
    autoConsultado = matchML[1].trim();
  }

  // ─────────────────────────────
  // 3️⃣ CUOTAS
  // ─────────────────────────────
  else if (esCompra) {
    categoria = 'compra';
  }
  else if (esCuotas) {
    categoria = 'cuotas';
    respuestaFija = 'Ya le aviso a un vendedor de la agencia para que te prepare una simulación de cuotas. Tené en cuenta que la respuesta puede no ser inmediata.';
  }

  // ─────────────────────────────
  // 4️⃣ FINANCIACIÓN SOLA
  // ─────────────────────────────
  else if (esFinanciacion) {
    categoria = 'financiacion';
  }

  // ─────────────────────────────
  // 5️⃣ SALUDO PURO
  // ─────────────────────────────
  else {
    const saludoRegex = /^(hola|ola|holi|hey|hi|buenas?|buen ?d[ií]a|buenos? d[ií]as?|buenas? tardes?|buenas? noches?|sa|sas|q onda|que onda|qu[eé] onda|saludos?|como est[aá]s?|c[oó]mo est[aá]s?|ke tal|q tal|qu[eé] tal|buen ?fin|buendia|hola a todos|q hay|qu[eé] hay|ey|wenas)[\s!?¡¿.]*$/i;
    if (saludoRegex.test(msg)) {
      categoria = 'saludo_puro';
    }

    // ─────────────────────────────
    // 6️⃣ TEMAS ADMINISTRATIVOS
    // ─────────────────────────────
    else {
      const adminKeywords = [
        '08', 'formulario 08', 'cédula', 'cedula', 'transferencia',
        'papeles', 'trámites', 'tramites', 'documentación',
        'documentacion', 'verificación', 'verificacion',
        'dominio', 'deuda', 'multas', 'patente', 'vtv', 'rto', 'título'
      ];
      const esAdmin = adminKeywords.some(kw => msg.includes(kw)) && !msg.includes('bancaria');
      if (esAdmin) {
        categoria = 'papeles';
        respuestaFija = 'Ya te pongo en contacto con un vendedor de la agencia para que resuelva tu duda. Tené en cuenta que la respuesta puede no ser inmediata.';
      }

      // ─────────────────────────────
      // 7️⃣ CONTACTO DIRECTO CON PERSONA
      // ─────────────────────────────
      else {
        const contactoKeywords = [
          'hablar con', 'quiero hablar con', 'pasame con',
          'comunicame con', 'necesito hablar con',
          'comunicarme con', 'me comunicas con'
        ];
        const kwUsada = contactoKeywords.find(kw => msg.includes(kw));
        if (kwUsada) {
          categoria = 'administracion';
          const partes = msg.split(kwUsada);
          const posibleNombre = partes[1]?.trim().split(/[ ,.!?\n]/)[0] || '';
          nombrePersona = posibleNombre
            ? posibleNombre.charAt(0).toUpperCase() + posibleNombre.slice(1)
            : 'un asesor';
          respuestaFija = `Ya te pongo en contacto con ${nombrePersona}, tené en cuenta que su respuesta puede no ser inmediata.`;
        }
      }
    }
  }

  return {
    json: {
      ...item.json,
      menssaje_final_cadena: mensajeOriginal,
      categoria,
      respuesta_fija: respuestaFija,
      derivacion_persona: nombrePersona,
      auto_consultado: autoConsultado
    }
  };
});
return output;