/**
 * Teste de carga k6 — Materiais / Suprimentos
 *
 * Pré-requisitos:
 *   1. Backend rodando (padrão: http://localhost:5000)
 *   2. Usuários de teste: npx tsx scripts/criar-usuarios-teste.ts
 *   3. OS de teste: npx tsx scripts/criar-os-teste.ts
 *   4. k6 instalado: https://k6.io/docs/get-started/installation/
 *
 * Gerar exatamente 50 RMs (modo seed — padrão):
 *   k6 run -e MODE=seed -e ITERATIONS=50 -e VUS=5 scripts/teste-carga-suprimentos.js
 *
 * Carga completa (ramping até 30 VUs):
 *   k6 run -e MODE=load scripts/teste-carga-suprimentos.js
 *
 * Variáveis opcionais:
 *   BASE_URL=http://localhost:5000/api
 *   MATERIAL_ID=cmr0wp8qf000n47fczdmn8ybb
 *   MODE=seed|load          (default: seed)
 *   ITERATIONS=50           (só MODE=seed)
 *   VUS=5                   (só MODE=seed)
 */

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000/api';
const MATERIAL_ID = __ENV.MATERIAL_ID || 'cmr0wp8qf000n47fczdmn8ybb';
const MODE = (__ENV.MODE || 'seed').toLowerCase();
const SEED_ITERATIONS = Number(__ENV.ITERATIONS || 50);
const SEED_VUS = Number(__ENV.VUS || 5);

/** Só incrementa quando POST /material-requests retorna 201 + id. */
const rmCreated = new Counter('rm_created');

const users = new SharedArray('test-users', () => {
  return JSON.parse(open('./test-users.json'));
});

const seedOptions = {
  scenarios: {
    seed_rms: {
      executor: 'shared-iterations',
      vus: SEED_VUS,
      iterations: SEED_ITERATIONS,
      maxDuration: '10m',
    },
  },
  thresholds: {
    // Exige exatamente N criações bem-sucedidas (não basta o VU ter rodado)
    rm_created: [`count==${SEED_ITERATIONS}`],
    http_req_failed: ['rate<0.15'],
    'http_req_duration{endpoint:create_rm}': ['p(95)<5000'],
  },
};

const loadOptions = {
  scenarios: {
    suprimentos: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 5 },
        { duration: '1m', target: 15 },
        { duration: '1m', target: 30 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.10'],
    'http_req_duration{endpoint:login}': ['p(95)<2000'],
    'http_req_duration{endpoint:create_rm}': ['p(95)<5000'],
    'http_req_duration{endpoint:list_rm}': ['p(95)<3000'],
  },
};

export const options = MODE === 'load' ? loadOptions : seedOptions;

function jsonHeaders(token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function parseJson(res) {
  try {
    return res.json();
  } catch {
    return null;
  }
}

function login(user) {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: user.email, password: user.password }),
    { headers: jsonHeaders(), tags: { endpoint: 'login' } },
  );

  const ok = check(res, {
    'login status 200': (r) => r.status === 200,
    'login retornou token': (r) => !!parseJson(r)?.data?.token,
  });

  if (!ok) return null;
  const body = parseJson(res);
  return {
    token: body.data.token,
    userId: body.data.user?.id,
  };
}

function findCostCenterWithServiceOrder(token) {
  const res = http.get(`${BASE_URL}/cost-centers?isActive=true&limit=500`, {
    headers: jsonHeaders(token),
    tags: { endpoint: 'cost_centers' },
  });

  check(res, { 'cost-centers status 200': (r) => r.status === 200 });
  const costCenters = parseJson(res)?.data;
  if (!Array.isArray(costCenters) || costCenters.length === 0) {
    return null;
  }

  for (const cc of costCenters) {
    const osRes = http.get(`${BASE_URL}/service-orders?costCenterId=${cc.id}`, {
      headers: jsonHeaders(token),
      tags: { endpoint: 'service_orders' },
    });

    if (osRes.status !== 200) continue;

    const body = parseJson(osRes);
    const orders = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
    if (orders.length === 0) continue;

    const os = orders[0];
    return {
      costCenterId: cc.id,
      costCenterCode: cc.code,
      serviceOrderId: os.id,
      serviceOrder: os.label || `OS ${os.numero}/${os.ano}`,
    };
  }

  return null;
}

function createMaterialRequest(token, ctx) {
  const payload = {
    costCenterId: ctx.costCenterId,
    serviceOrderId: ctx.serviceOrderId,
    serviceOrder: ctx.serviceOrder,
    obra: `Obra carga k6 VU${__VU}`,
    description: `RM gerada por teste de carga — iter ${__ITER}`,
    priority: 'MEDIUM',
    demandSheet: `FD-K6-${Date.now()}-${__VU}-${__ITER}`,
    demandSheetAttachmentUrl: '/uploads/material-request-items/k6-loadtest.pdf',
    demandSheetAttachmentName: 'k6-loadtest.pdf',
    items: [
      {
        materialId: ctx.materialId,
        quantity: randomIntBetween(1, 20),
        observation: 'Item gerado pelo k6',
      },
    ],
  };

  const res = http.post(`${BASE_URL}/material-requests`, JSON.stringify(payload), {
    headers: jsonHeaders(token),
    tags: { endpoint: 'create_rm' },
  });

  const body = parseJson(res);
  const created =
    res.status === 201 && body?.success === true && !!(body?.data?.id || body?.data?.requestNumber);

  check(res, {
    'create RM status 201': (r) => r.status === 201,
    'create RM success true': () => body?.success === true,
    'create RM retornou id': () => !!(body?.data?.id || body?.data?.requestNumber),
  });

  if (!created) {
    console.error(
      `[create_rm FAIL] VU=${__VU} iter=${__ITER} status=${res.status} body=${res.body}`,
    );
    return null;
  }

  rmCreated.add(1);
  return body.data;
}

function listMaterialRequests(token, userId) {
  const res = http.get(
    `${BASE_URL}/material-requests?requestedBy=${userId}&page=1&limit=10`,
    { headers: jsonHeaders(token), tags: { endpoint: 'list_rm' } },
  );

  check(res, {
    'list RM status 200': (r) => r.status === 200,
    'list RM tem pagination': (r) => !!parseJson(r)?.pagination,
  });
}

/**
 * Em MODE=seed, cada iteração precisa produzir 1 RM.
 * Retenta login/create se falhar (não "gasta" a iteração sem criar).
 */
function createOneRmWithRetries(user, osCtx, maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const session = login(user);
    if (!session?.token) {
      console.warn(`VU ${__VU}: login falhou (tentativa ${attempt}/${maxAttempts})`);
      sleep(0.5);
      continue;
    }

    const created = createMaterialRequest(session.token, {
      costCenterId: osCtx.costCenterId,
      serviceOrderId: osCtx.serviceOrderId,
      serviceOrder: osCtx.serviceOrder,
      materialId: MATERIAL_ID,
    });

    if (created) {
      if (MODE !== 'seed') {
        listMaterialRequests(session.token, session.userId);
      }
      return created;
    }

    sleep(0.5);
  }
  return null;
}

export function setup() {
  const health = http.get(`${BASE_URL.replace(/\/api$/, '')}/health`);
  if (health.status !== 200) {
    throw new Error(
      `Backend indisponível em ${BASE_URL}. Suba o servidor antes de rodar o k6.`,
    );
  }
  if (users.length === 0) {
    throw new Error('test-users.json vazio. Rode: npx tsx scripts/criar-usuarios-teste.ts');
  }

  // Valida centro+OS uma vez (evita VU “vazio” que não cria RM)
  const probeUser = users[0];
  const session = login(probeUser);
  if (!session?.token) {
    throw new Error(`Falha no login de setup (${probeUser.email})`);
  }

  const osCtx = findCostCenterWithServiceOrder(session.token);
  if (!osCtx) {
    throw new Error(
      'Nenhum centro de custo com OS listável. Rode: npx tsx scripts/criar-os-teste.ts',
    );
  }

  console.log(
    `setup OK — MODE=${MODE} | CC=${osCtx.costCenterCode} | OS=${osCtx.serviceOrderId}` +
      (MODE === 'seed' ? ` | iterations=${SEED_ITERATIONS} vus=${SEED_VUS}` : ''),
  );

  return { osCtx };
}

export default function (data) {
  const user = users[(__VU - 1) % users.length];
  const osCtx = data.osCtx;

  if (MODE === 'seed') {
    const created = createOneRmWithRetries(user, osCtx);
    const ok = check(null, {
      'iteração criou RM de fato': () => !!created,
    });
    if (!ok) {
      fail(
        `VU ${__VU} iter ${__ITER}: não criou RM após retries — abortando para não mentir nas metrics`,
      );
    }
    sleep(randomIntBetween(0, 1));
    return;
  }

  // MODE=load — fluxo original
  const session = login(user);
  if (!session?.token) {
    sleep(1);
    return;
  }

  const ctx = findCostCenterWithServiceOrder(session.token) || osCtx;
  if (!ctx) {
    console.warn(
      `VU ${__VU}: Nenhum centro de custo com OS encontrado — rode o script criar-os-teste.ts antes`,
    );
    sleep(1);
    return;
  }

  createMaterialRequest(session.token, {
    costCenterId: ctx.costCenterId,
    serviceOrderId: ctx.serviceOrderId,
    serviceOrder: ctx.serviceOrder,
    materialId: MATERIAL_ID,
  });

  listMaterialRequests(session.token, session.userId);
  sleep(randomIntBetween(1, 3));
}
