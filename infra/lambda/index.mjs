/**
 * Ma Santé Tranquille — demo backend for the three APIs described in specs/.
 *
 * One Lambda behind an API Gateway HTTP API serves:
 *   /surveillance/v1  Health Surveillance API
 *   /pharmacies/v1    Pharmacies API
 *   /appointments/v1  Appointments API
 *
 * Responses follow the contract examples. The demo cases are real rules, not mock headers:
 *   - prac-003 has no slot;
 *   - a social security number (French NIR) sent in clear is rejected with 422;
 *   - a booking without patient_confirmed: true is rejected with 428.
 * Data is fictitious and dated, for the hackathon only.
 */

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const error = (statusCode, code, message) => json(statusCode, { code, message });

const POSTAL_CODE = /^[0-9]{5}$/;
// French NIR: 13 digits + 2-digit key, starting with 1 or 2, optionally spaced. Corsica uses 2A/2B.
const NIR = /\b[12][\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?(\d{2}|2A|2B)[\s.-]?\d{3}[\s.-]?\d{3}[\s.-]?\d{2}\b/i;

const PRACTITIONERS = [
  { practitioner_id: 'prac-001', name: 'Dr Claire Martin', specialty: 'general_practitioner', address: '18 rue Paul Bert, 69003 Lyon', distance_km: 0.8, modes: ['in_person', 'video'], next_slot: '2026-11-04T14:30:00+01:00' },
  { practitioner_id: 'prac-002', name: 'Dr Karim Benali', specialty: 'general_practitioner', address: '7 cours Lafayette, 69003 Lyon', distance_km: 1.1, modes: ['in_person'], next_slot: '2026-11-05T09:00:00+01:00' },
  { practitioner_id: 'prac-003', name: 'Dr Sophie Leroy', specialty: 'general_practitioner', address: '52 avenue Félix Faure, 69003 Lyon', distance_km: 1.9, modes: ['video'], next_slot: null },
];

const SLOTS = {
  'prac-001': [
    { slot_id: 'sl-001-1430', start: '2026-11-04T14:30:00+01:00', mode: 'in_person' },
    { slot_id: 'sl-001-1645', start: '2026-11-04T16:45:00+01:00', mode: 'video' },
    { slot_id: 'sl-001-0915', start: '2026-11-05T09:15:00+01:00', mode: 'in_person' },
  ],
  'prac-002': [
    { slot_id: 'sl-002-0900', start: '2026-11-05T09:00:00+01:00', mode: 'in_person' },
  ],
  'prac-003': [],
};

const PHARMACIES = [
  { pharmacy_id: 'ph-69003-01', name: 'Pharmacie de la Part-Dieu', address: '12 rue Garibaldi, 69003 Lyon', distance_km: 0.6, hours_today: '08:30–20:00', open_now: true, service: { code: 'rapid_antigen_test', status: 'confirmed', bookable: true } },
  { pharmacy_id: 'ph-69003-02', name: 'Pharmacie Monplaisir', address: '4 avenue des Frères Lumière, 69003 Lyon', distance_km: 1.4, hours_today: '09:00–19:30', open_now: true, service: { code: 'rapid_antigen_test', status: 'to_check', bookable: false } },
];

function trends(query) {
  const postalCode = query.postal_code;
  if (!POSTAL_CODE.test(postalCode ?? '')) {
    return error(400, 'invalid_postal_code', 'The postal code must have 5 digits.');
  }
  if (!postalCode.startsWith('69')) {
    return error(404, 'no_data_for_area', 'No indicator is available for this postal code this week.');
  }
  let indicators = [
    { condition: 'flu', level: 'moderate', trend: 'rising', rate_per_100k: 142 },
    { condition: 'covid19', level: 'low', trend: 'stable', rate_per_100k: 38 },
    { condition: 'bronchiolitis', level: 'high', trend: 'rising', rate_per_100k: 210 },
  ];
  if (query.condition) indicators = indicators.filter((i) => i.condition === query.condition);
  return json(200, {
    source: 'Santé publique France – syndromic surveillance (simulated data)',
    data_date: '2026-10-26',
    week: '2026-W44',
    area: { postal_code: postalCode, department: 'Rhône (69)', region: 'Auvergne-Rhône-Alpes' },
    indicators,
    disclaimer: 'These trends describe the area. They cannot tell what illness you have.',
  });
}

function bookPharmacy(pharmacyId, body) {
  const pharmacy = PHARMACIES.find((p) => p.pharmacy_id === pharmacyId);
  if (!pharmacy) return error(404, 'pharmacy_not_found', 'Unknown pharmacy.');
  if (NIR.test(JSON.stringify(body))) {
    return error(422, 'sensitive_data_rejected', 'A social security number was detected in clear.');
  }
  if (body.patient_confirmed !== true) {
    return error(428, 'confirmation_required', "A booking requires the patient's explicit confirmation.");
  }
  if (!pharmacy.service.bookable) {
    return error(409, 'slot_unavailable', 'This pharmacy does not take bookings for this service. Offer the patient another pharmacy.');
  }
  return json(201, {
    booking_id: 'bk-ph-000184',
    status: 'confirmed',
    pharmacy: pharmacy.name,
    service: body.service ?? pharmacy.service.code,
    slot: body.slot ?? '2026-11-04T10:15:00+01:00',
    instructions: 'Arrive 5 minutes before your slot.',
  });
}

function bookAppointment(body) {
  if (NIR.test(JSON.stringify(body))) {
    return error(422, 'sensitive_data_rejected', 'A social security number was detected in clear. Use ssn_token.');
  }
  if (body.patient_confirmed !== true) {
    return error(428, 'confirmation_required', "An appointment requires the patient's explicit confirmation.");
  }
  const practitioner = PRACTITIONERS.find((p) => p.practitioner_id === body.practitioner_id);
  const slot = (SLOTS[body.practitioner_id] ?? []).find((s) => s.slot_id === body.slot_id);
  if (!practitioner || !slot) {
    return error(409, 'slot_unavailable', 'This slot was just taken. Offer the patient another slot.');
  }
  return json(201, {
    appointment_id: 'apt-000732',
    status: 'confirmed',
    practitioner: practitioner.name,
    start: slot.start,
    mode: slot.mode,
    address: practitioner.address,
    trace_id: `trc-${Math.random().toString(16).slice(2, 8)}`,
  });
}

export async function handler(event) {
  const method = event.requestContext?.http?.method ?? 'GET';
  const path = (event.rawPath ?? '/').replace(/\/+$/, '');
  const query = event.queryStringParameters ?? {};
  let body = {};
  if (event.body) {
    try {
      body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body);
    } catch {
      return error(400, 'invalid_json', 'The request body must be valid JSON.');
    }
  }

  let m;
  if (method === 'GET' && path === '/surveillance/v1/trends') return trends(query);

  if (method === 'GET' && path === '/pharmacies/v1/pharmacies') {
    if (!POSTAL_CODE.test(query.postal_code ?? '')) return error(400, 'invalid_postal_code', 'The postal code must have 5 digits.');
    const service = query.service ?? 'rapid_antigen_test';
    return json(200, { results: PHARMACIES.map((p) => ({ ...p, service: { ...p.service, code: service } })) });
  }
  if (method === 'GET' && path === '/pharmacies/v1/pharmacies/on-duty') {
    if (!POSTAL_CODE.test(query.postal_code ?? '')) return error(400, 'invalid_postal_code', 'The postal code must have 5 digits.');
    return json(200, {
      pharmacy_id: 'ph-69007-09',
      name: 'Pharmacie du Rhône',
      address: '30 avenue Jean Jaurès, 69007 Lyon',
      distance_km: 2.8,
      on_duty_until: '2026-11-04T08:30:00+01:00',
      access_conditions: 'Night window. Bring a prescription or call 3237 first.',
    });
  }
  if (method === 'POST' && (m = path.match(/^\/pharmacies\/v1\/pharmacies\/([^/]+)\/bookings$/))) return bookPharmacy(m[1], body);

  if (method === 'GET' && path === '/appointments/v1/practitioners') {
    if (!POSTAL_CODE.test(query.postal_code ?? '')) return error(400, 'invalid_postal_code', 'The postal code must have 5 digits.');
    let results = PRACTITIONERS;
    if (query.mode) results = results.filter((p) => p.modes.includes(query.mode));
    return json(200, { results });
  }
  if (method === 'GET' && (m = path.match(/^\/appointments\/v1\/practitioners\/([^/]+)\/slots$/))) {
    const slots = SLOTS[m[1]];
    if (!slots) return error(404, 'practitioner_not_found', 'Unknown practitioner.');
    return json(200, slots.length
      ? { practitioner_id: m[1], slots }
      : { practitioner_id: m[1], slots: [], message: 'No slot in the next 7 days.' });
  }
  if (method === 'POST' && path === '/appointments/v1/appointments') return bookAppointment(body);

  return error(404, 'not_found', `No route for ${method} ${path}.`);
}
