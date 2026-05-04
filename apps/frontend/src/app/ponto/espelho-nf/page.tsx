'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Download, Eye, FileSpreadsheet, FileText, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { buildEspelhoDetailRows, exportEspelhoNfExcel, exportEspelhoNfPdf } from '@/lib/exportEspelhoNfLayout';

type MirrorDraft = {
  contract: string;
  measurementRef: string;
  costCenter: string;
  dueDate: string;
  notes: string;
  providerId: string;
  providerName: string;
  takerId: string;
  takerName: string;
  bankAccountId: string;
  bankAccountName: string;
  taxCodeId: string;
  taxCodeCityName: string;
};

type SavedMirror = MirrorDraft & { id: string };

function newSavedMirrorId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

type ServiceProvider = {
  id: string;
  cnpj: string;
  municipalRegistration: string;
  stateRegistration: string;
  corporateName: string;
  tradeName: string;
  address: string;
  city: string;
  state: string;
  email: string;
};

type ServiceTaker = {
  id: string;
  name: string;
  cnpj: string;
  municipalRegistration: string;
  stateRegistration: string;
  corporateName: string;
  address: string;
  city: string;
  state: string;
  contractRef: string;
  serviceDescription: string;
};

type BankAccount = {
  id: string;
  name: string;
  bank: string;
  agency: string;
  account: string;
};

type FederalTaxRates = {
  cofins: string;
  csll: string;
  inss: string;
  irpj: string;
  pis: string;
};

type TaxRule = {
  collectionType: 'RETIDO' | 'RECOLHIDO';
};

type TaxCode = {
  id: string;
  cityName: string;
  abatesMaterial: boolean;
  issRate: string;
  cofins: TaxRule;
  csll: TaxRule;
  inss: TaxRule;
  irpj: TaxRule;
  pis: TaxRule;
  iss: TaxRule;
  inssMaterialLimit: string;
  issMaterialLimit: string;
};

const INITIAL_DRAFT: MirrorDraft = {
  contract: '',
  measurementRef: '',
  costCenter: '',
  dueDate: '',
  notes: '',
  providerId: '',
  providerName: '',
  takerId: '',
  takerName: '',
  bankAccountId: '',
  bankAccountName: '',
  taxCodeId: '',
  taxCodeCityName: ''
};

const INITIAL_PROVIDER_FORM: Omit<ServiceProvider, 'id'> = {
  cnpj: '',
  municipalRegistration: '',
  stateRegistration: '',
  corporateName: '',
  tradeName: '',
  address: '',
  city: '',
  state: '',
  email: ''
};

const PROVIDERS_STORAGE_KEY = 'espelho-nf-service-providers';
const TAKERS_STORAGE_KEY = 'espelho-nf-service-takers';
const BANK_ACCOUNTS_STORAGE_KEY = 'espelho-nf-bank-accounts';
const TAX_CODES_STORAGE_KEY = 'espelho-nf-tax-codes';
const FEDERAL_TAX_RATES_STORAGE_KEY = 'espelho-nf-federal-tax-rates';

const INITIAL_TAKER_FORM: Omit<ServiceTaker, 'id'> = {
  name: '',
  cnpj: '',
  municipalRegistration: '',
  stateRegistration: '',
  corporateName: '',
  address: '',
  city: '',
  state: '',
  contractRef: '',
  serviceDescription: ''
};

const INITIAL_BANK_ACCOUNT_FORM: Omit<BankAccount, 'id'> = {
  name: '',
  bank: '',
  agency: '',
  account: ''
};

const INITIAL_TAX_RULE: TaxRule = {
  collectionType: 'RETIDO'
};

const INITIAL_FEDERAL_TAX_RATES: FederalTaxRates = {
  cofins: '',
  csll: '',
  inss: '',
  irpj: '',
  pis: ''
};

const INITIAL_TAX_CODE_FORM: Omit<TaxCode, 'id'> = {
  cityName: '',
  abatesMaterial: false,
  issRate: '',
  cofins: { ...INITIAL_TAX_RULE },
  csll: { ...INITIAL_TAX_RULE },
  inss: { ...INITIAL_TAX_RULE },
  irpj: { ...INITIAL_TAX_RULE },
  pis: { ...INITIAL_TAX_RULE },
  iss: { ...INITIAL_TAX_RULE },
  inssMaterialLimit: '',
  issMaterialLimit: ''
};

export default function EspelhoNfPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    'espelho' | 'prestadores' | 'tomadores' | 'contas-bancarias' | 'codigo-tributario'
  >('espelho');
  const [draft, setDraft] = useState<MirrorDraft>(INITIAL_DRAFT);
  const [savedDrafts, setSavedDrafts] = useState<SavedMirror[]>([]);
  const [editingSavedMirrorId, setEditingSavedMirrorId] = useState<string | null>(null);
  const [detailMirror, setDetailMirror] = useState<SavedMirror | null>(null);
  const [serviceProviders, setServiceProviders] = useState<ServiceProvider[]>([]);
  const [serviceTakers, setServiceTakers] = useState<ServiceTaker[]>([]);
  const [providerForm, setProviderForm] = useState(INITIAL_PROVIDER_FORM);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [takerForm, setTakerForm] = useState(INITIAL_TAKER_FORM);
  const [editingTakerId, setEditingTakerId] = useState<string | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [bankAccountForm, setBankAccountForm] = useState(INITIAL_BANK_ACCOUNT_FORM);
  const [editingBankAccountId, setEditingBankAccountId] = useState<string | null>(null);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [taxCodeForm, setTaxCodeForm] = useState(INITIAL_TAX_CODE_FORM);
  const [editingTaxCodeId, setEditingTaxCodeId] = useState<string | null>(null);
  const [federalTaxRates, setFederalTaxRates] = useState<FederalTaxRates>(INITIAL_FEDERAL_TAX_RATES);
  const [espelhoProviderSearch, setEspelhoProviderSearch] = useState('');
  const [espelhoTakerSearch, setEspelhoTakerSearch] = useState('');
  const [espelhoTaxCodeSearch, setEspelhoTaxCodeSearch] = useState('');
  const [espelhoBankSearch, setEspelhoBankSearch] = useState('');

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  const normalizeForSearch = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const formatPercentInput = (value: string) => {
    const cleaned = value.replace(/[^\d,.-]/g, '').replace('.', ',');
    const normalized = cleaned.replace(/(,.*?),/g, '$1');
    if (!normalized) return '';
    const parsed = Number(normalized.replace(',', '.'));
    if (!Number.isFinite(parsed)) return '';
    const clamped = Math.max(0, Math.min(100, parsed));
    return clamped.toString().replace('.', ',');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const canSave = useMemo(
    () =>
      Boolean(
        draft.contract.trim() &&
          draft.measurementRef.trim() &&
          draft.costCenter.trim() &&
          draft.providerId &&
          draft.takerId &&
          draft.bankAccountId &&
          draft.taxCodeId
      ),
    [draft]
  );

  const filteredEspelhoProviders = useMemo(() => {
    const q = normalizeForSearch(espelhoProviderSearch.trim());
    if (!q) return serviceProviders;
    return serviceProviders.filter((p) =>
      normalizeForSearch(
        `${p.corporateName} ${p.tradeName} ${p.cnpj} ${p.city} ${p.state}`
      ).includes(q)
    );
  }, [serviceProviders, espelhoProviderSearch]);

  const filteredEspelhoTakers = useMemo(() => {
    const q = normalizeForSearch(espelhoTakerSearch.trim());
    if (!q) return serviceTakers;
    return serviceTakers.filter((t) =>
      normalizeForSearch(
        `${t.name} ${t.corporateName} ${t.cnpj} ${t.contractRef} ${t.city} ${t.state}`
      ).includes(q)
    );
  }, [serviceTakers, espelhoTakerSearch]);

  const filteredEspelhoTaxCodes = useMemo(() => {
    const q = normalizeForSearch(espelhoTaxCodeSearch.trim());
    if (!q) return taxCodes;
    return taxCodes.filter((tc) =>
      normalizeForSearch(
        `${tc.cityName} ${tc.issRate} ${tc.abatesMaterial ? 'abate material' : 'nao abate material'} iss`
      ).includes(q)
    );
  }, [taxCodes, espelhoTaxCodeSearch]);

  const filteredEspelhoBankAccounts = useMemo(() => {
    const q = normalizeForSearch(espelhoBankSearch.trim());
    if (!q) return bankAccounts;
    return bankAccounts.filter((a) =>
      normalizeForSearch(`${a.name} ${a.bank} ${a.agency} ${a.account}`).includes(q)
    );
  }, [bankAccounts, espelhoBankSearch]);

  useEffect(() => {
    const raw = localStorage.getItem(PROVIDERS_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as ServiceProvider[];
      if (Array.isArray(parsed)) {
        setServiceProviders(parsed);
      }
    } catch {
      localStorage.removeItem(PROVIDERS_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(PROVIDERS_STORAGE_KEY, JSON.stringify(serviceProviders));
  }, [serviceProviders]);

  useEffect(() => {
    const raw = localStorage.getItem(TAKERS_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<ServiceTaker>[];
      if (Array.isArray(parsed)) {
        const normalized = parsed.map((item) => ({
          id: String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
          name: String(item.name || item.corporateName || ''),
          cnpj: String(item.cnpj || ''),
          municipalRegistration: String(item.municipalRegistration || ''),
          stateRegistration: String(item.stateRegistration || ''),
          corporateName: String(item.corporateName || ''),
          address: String(item.address || ''),
          city: String(item.city || ''),
          state: String(item.state || ''),
          contractRef: String(item.contractRef || ''),
          serviceDescription: String(item.serviceDescription || '')
        }));
        setServiceTakers(normalized);
      }
    } catch {
      localStorage.removeItem(TAKERS_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(TAKERS_STORAGE_KEY, JSON.stringify(serviceTakers));
  }, [serviceTakers]);

  useEffect(() => {
    const raw = localStorage.getItem(BANK_ACCOUNTS_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<BankAccount>[];
      if (Array.isArray(parsed)) {
        const normalized = parsed.map((item) => ({
          id: String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
          name: String(item.name || ''),
          bank: String(item.bank || ''),
          agency: String(item.agency || ''),
          account: String(item.account || '')
        }));
        setBankAccounts(normalized);
      }
    } catch {
      localStorage.removeItem(BANK_ACCOUNTS_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(BANK_ACCOUNTS_STORAGE_KEY, JSON.stringify(bankAccounts));
  }, [bankAccounts]);

  useEffect(() => {
    const raw = localStorage.getItem(TAX_CODES_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<TaxCode>[];
      if (Array.isArray(parsed)) {
        const normalizeRule = (rule?: Partial<TaxRule>): TaxRule => ({
          collectionType: rule?.collectionType === 'RECOLHIDO' ? 'RECOLHIDO' : 'RETIDO'
        });
        const normalized = parsed.map((item) => ({
          id: String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
          cityName: String(item.cityName || ''),
          abatesMaterial: Boolean(item.abatesMaterial),
          issRate: String(item.issRate || ''),
          cofins: normalizeRule(item.cofins),
          csll: normalizeRule(item.csll),
          inss: normalizeRule(item.inss),
          irpj: normalizeRule(item.irpj),
          pis: normalizeRule(item.pis),
          iss: normalizeRule(item.iss),
          inssMaterialLimit: String(item.inssMaterialLimit || ''),
          issMaterialLimit: String(item.issMaterialLimit || '')
        }));
        setTaxCodes(normalized);
      }
    } catch {
      localStorage.removeItem(TAX_CODES_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(TAX_CODES_STORAGE_KEY, JSON.stringify(taxCodes));
  }, [taxCodes]);

  useEffect(() => {
    const raw = localStorage.getItem(FEDERAL_TAX_RATES_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<FederalTaxRates>;
      setFederalTaxRates({
        cofins: String(parsed?.cofins || ''),
        csll: String(parsed?.csll || ''),
        inss: String(parsed?.inss || ''),
        irpj: String(parsed?.irpj || ''),
        pis: String(parsed?.pis || '')
      });
    } catch {
      localStorage.removeItem(FEDERAL_TAX_RATES_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(FEDERAL_TAX_RATES_STORAGE_KEY, JSON.stringify(federalTaxRates));
  }, [federalTaxRates]);

  const canSaveProvider = useMemo(
    () =>
      Boolean(
        providerForm.cnpj.trim() &&
          providerForm.municipalRegistration.trim() &&
          providerForm.stateRegistration.trim() &&
          providerForm.corporateName.trim() &&
          providerForm.tradeName.trim() &&
          providerForm.address.trim() &&
          providerForm.city.trim() &&
          providerForm.state.trim()
      ),
    [providerForm]
  );

  const handleCreateOrUpdateProvider = () => {
    if (!canSaveProvider) {
      toast.error('Preencha os campos obrigatórios do prestador de serviço.');
      return;
    }
    if (editingProviderId) {
      setServiceProviders((prev) =>
        prev.map((provider) =>
          provider.id === editingProviderId
            ? {
                ...provider,
                cnpj: providerForm.cnpj.trim(),
                municipalRegistration: providerForm.municipalRegistration.trim(),
                stateRegistration: providerForm.stateRegistration.trim(),
                corporateName: providerForm.corporateName.trim(),
                tradeName: providerForm.tradeName.trim(),
                address: providerForm.address.trim(),
                city: providerForm.city.trim(),
                state: providerForm.state.trim().toUpperCase(),
                email: providerForm.email.trim()
              }
            : provider
        )
      );
      setEditingProviderId(null);
      setProviderForm(INITIAL_PROVIDER_FORM);
      toast.success('Prestador de serviço atualizado.');
      return;
    }
    const newProvider: ServiceProvider = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      cnpj: providerForm.cnpj.trim(),
      municipalRegistration: providerForm.municipalRegistration.trim(),
      stateRegistration: providerForm.stateRegistration.trim(),
      corporateName: providerForm.corporateName.trim(),
      tradeName: providerForm.tradeName.trim(),
      address: providerForm.address.trim(),
      city: providerForm.city.trim(),
      state: providerForm.state.trim().toUpperCase(),
      email: providerForm.email.trim()
    };
    setServiceProviders((prev) => [newProvider, ...prev]);
    setProviderForm(INITIAL_PROVIDER_FORM);
    toast.success('Prestador de serviço cadastrado.');
  };

  const handleEditProvider = (provider: ServiceProvider) => {
    setEditingProviderId(provider.id);
    setProviderForm({
      cnpj: provider.cnpj,
      municipalRegistration: provider.municipalRegistration,
      stateRegistration: provider.stateRegistration,
      corporateName: provider.corporateName,
      tradeName: provider.tradeName,
      address: provider.address,
      city: provider.city,
      state: provider.state,
      email: provider.email
    });
    setActiveTab('prestadores');
  };

  const handleDeleteProvider = (providerId: string) => {
    setServiceProviders((prev) => prev.filter((provider) => provider.id !== providerId));
    setDraft((prev) =>
      prev.providerId === providerId ? { ...prev, providerId: '', providerName: '' } : prev
    );
    if (editingProviderId === providerId) {
      setEditingProviderId(null);
      setProviderForm(INITIAL_PROVIDER_FORM);
    }
    toast.success('Prestador de serviço excluído.');
  };

  const canSaveTaker = useMemo(
    () =>
      Boolean(
        takerForm.cnpj.trim() &&
          takerForm.name.trim() &&
          takerForm.municipalRegistration.trim() &&
          takerForm.stateRegistration.trim() &&
          takerForm.corporateName.trim() &&
          takerForm.address.trim() &&
          takerForm.city.trim() &&
          takerForm.state.trim() &&
          takerForm.contractRef.trim() &&
          takerForm.serviceDescription.trim()
      ),
    [takerForm]
  );

  const handleCreateOrUpdateTaker = () => {
    if (!canSaveTaker) {
      toast.error('Preencha os campos obrigatórios do tomador de serviço.');
      return;
    }
    if (editingTakerId) {
      setServiceTakers((prev) =>
        prev.map((taker) =>
          taker.id === editingTakerId
            ? {
                ...taker,
                name: takerForm.name.trim(),
                cnpj: takerForm.cnpj.trim(),
                municipalRegistration: takerForm.municipalRegistration.trim(),
                stateRegistration: takerForm.stateRegistration.trim(),
                corporateName: takerForm.corporateName.trim(),
                address: takerForm.address.trim(),
                city: takerForm.city.trim(),
                state: takerForm.state.trim().toUpperCase(),
                contractRef: takerForm.contractRef.trim(),
                serviceDescription: takerForm.serviceDescription.trim()
              }
            : taker
        )
      );
      setEditingTakerId(null);
      setTakerForm(INITIAL_TAKER_FORM);
      toast.success('Tomador de serviço atualizado.');
      return;
    }

    const newTaker: ServiceTaker = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: takerForm.name.trim(),
      cnpj: takerForm.cnpj.trim(),
      municipalRegistration: takerForm.municipalRegistration.trim(),
      stateRegistration: takerForm.stateRegistration.trim(),
      corporateName: takerForm.corporateName.trim(),
      address: takerForm.address.trim(),
      city: takerForm.city.trim(),
      state: takerForm.state.trim().toUpperCase(),
      contractRef: takerForm.contractRef.trim(),
      serviceDescription: takerForm.serviceDescription.trim()
    };
    setServiceTakers((prev) => [newTaker, ...prev]);
    setTakerForm(INITIAL_TAKER_FORM);
    toast.success('Tomador de serviço cadastrado.');
  };

  const handleEditTaker = (taker: ServiceTaker) => {
    setEditingTakerId(taker.id);
    setTakerForm({
      name: taker.name || taker.corporateName || '',
      cnpj: taker.cnpj,
      municipalRegistration: taker.municipalRegistration,
      stateRegistration: taker.stateRegistration,
      corporateName: taker.corporateName,
      address: taker.address,
      city: taker.city,
      state: taker.state,
      contractRef: taker.contractRef,
      serviceDescription: taker.serviceDescription
    });
    setActiveTab('tomadores');
  };

  const handleDeleteTaker = (takerId: string) => {
    setServiceTakers((prev) => prev.filter((taker) => taker.id !== takerId));
    setDraft((prev) => (prev.takerId === takerId ? { ...prev, takerId: '', takerName: '' } : prev));
    if (editingTakerId === takerId) {
      setEditingTakerId(null);
      setTakerForm(INITIAL_TAKER_FORM);
    }
    toast.success('Tomador de serviço excluído.');
  };

  const canSaveBankAccount = useMemo(
    () =>
      Boolean(
        bankAccountForm.name.trim() &&
          bankAccountForm.bank.trim() &&
          bankAccountForm.agency.trim() &&
          bankAccountForm.account.trim()
      ),
    [bankAccountForm]
  );

  const handleCreateOrUpdateBankAccount = () => {
    if (!canSaveBankAccount) {
      toast.error('Preencha os campos obrigatórios da conta bancária.');
      return;
    }

    if (editingBankAccountId) {
      setBankAccounts((prev) =>
        prev.map((account) =>
          account.id === editingBankAccountId
            ? {
                ...account,
                name: bankAccountForm.name.trim(),
                bank: bankAccountForm.bank.trim(),
                agency: bankAccountForm.agency.trim(),
                account: bankAccountForm.account.trim()
              }
            : account
        )
      );
      setEditingBankAccountId(null);
      setBankAccountForm(INITIAL_BANK_ACCOUNT_FORM);
      toast.success('Conta bancária atualizada.');
      return;
    }

    const newAccount: BankAccount = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: bankAccountForm.name.trim(),
      bank: bankAccountForm.bank.trim(),
      agency: bankAccountForm.agency.trim(),
      account: bankAccountForm.account.trim()
    };
    setBankAccounts((prev) => [newAccount, ...prev]);
    setBankAccountForm(INITIAL_BANK_ACCOUNT_FORM);
    toast.success('Conta bancária cadastrada.');
  };

  const handleEditBankAccount = (account: BankAccount) => {
    setEditingBankAccountId(account.id);
    setBankAccountForm({
      name: account.name,
      bank: account.bank,
      agency: account.agency,
      account: account.account
    });
    setActiveTab('contas-bancarias');
  };

  const handleDeleteBankAccount = (accountId: string) => {
    setBankAccounts((prev) => prev.filter((account) => account.id !== accountId));
    setDraft((prev) =>
      prev.bankAccountId === accountId
        ? { ...prev, bankAccountId: '', bankAccountName: '' }
        : prev
    );
    if (editingBankAccountId === accountId) {
      setEditingBankAccountId(null);
      setBankAccountForm(INITIAL_BANK_ACCOUNT_FORM);
    }
    toast.success('Conta bancária excluída.');
  };

  const canSaveTaxCode = useMemo(
    () =>
      Boolean(
        taxCodeForm.cityName.trim() &&
          taxCodeForm.issRate.trim() &&
          (!taxCodeForm.abatesMaterial ||
            (taxCodeForm.inssMaterialLimit.trim() && taxCodeForm.issMaterialLimit.trim()))
      ),
    [taxCodeForm]
  );

  const handleTaxRuleFieldChange = (
    taxName: 'cofins' | 'csll' | 'inss' | 'irpj' | 'pis' | 'iss',
    value: 'RETIDO' | 'RECOLHIDO'
  ) => {
    setTaxCodeForm((prev) => ({
      ...prev,
      [taxName]: {
        ...prev[taxName],
        collectionType: value
      }
    }));
  };

  const handleFederalTaxRateChange = (
    taxName: keyof FederalTaxRates,
    value: string
  ) => {
    setFederalTaxRates((prev) => ({ ...prev, [taxName]: formatPercentInput(value) }));
  };

  const handleCreateOrUpdateTaxCode = () => {
    if (!canSaveTaxCode) {
      toast.error('Preencha todos os campos obrigatórios do código tributário.');
      return;
    }
    if (editingTaxCodeId) {
      setTaxCodes((prev) =>
        prev.map((taxCode) =>
          taxCode.id === editingTaxCodeId
            ? {
                ...taxCode,
                cityName: taxCodeForm.cityName.trim(),
                abatesMaterial: taxCodeForm.abatesMaterial,
                issRate: taxCodeForm.issRate.trim(),
                cofins: { ...taxCodeForm.cofins },
                csll: { ...taxCodeForm.csll },
                inss: { ...taxCodeForm.inss },
                irpj: { ...taxCodeForm.irpj },
                pis: { ...taxCodeForm.pis },
                iss: { ...taxCodeForm.iss },
                inssMaterialLimit: taxCodeForm.inssMaterialLimit.trim(),
                issMaterialLimit: taxCodeForm.issMaterialLimit.trim()
              }
            : taxCode
        )
      );
      setEditingTaxCodeId(null);
      setTaxCodeForm(INITIAL_TAX_CODE_FORM);
      toast.success('Código tributário atualizado.');
      return;
    }

    const newTaxCode: TaxCode = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      cityName: taxCodeForm.cityName.trim(),
      abatesMaterial: taxCodeForm.abatesMaterial,
      issRate: taxCodeForm.issRate.trim(),
      cofins: { ...taxCodeForm.cofins },
      csll: { ...taxCodeForm.csll },
      inss: { ...taxCodeForm.inss },
      irpj: { ...taxCodeForm.irpj },
      pis: { ...taxCodeForm.pis },
      iss: { ...taxCodeForm.iss },
      inssMaterialLimit: taxCodeForm.inssMaterialLimit.trim(),
      issMaterialLimit: taxCodeForm.issMaterialLimit.trim()
    };
    setTaxCodes((prev) => [newTaxCode, ...prev]);
    setTaxCodeForm(INITIAL_TAX_CODE_FORM);
    toast.success('Código tributário cadastrado.');
  };

  const handleEditTaxCode = (taxCode: TaxCode) => {
    setEditingTaxCodeId(taxCode.id);
    setTaxCodeForm({
      cityName: taxCode.cityName,
      abatesMaterial: taxCode.abatesMaterial,
      issRate: taxCode.issRate,
      cofins: { ...taxCode.cofins },
      csll: { ...taxCode.csll },
      inss: { ...taxCode.inss },
      irpj: { ...taxCode.irpj },
      pis: { ...taxCode.pis },
      iss: { ...taxCode.iss },
      inssMaterialLimit: taxCode.inssMaterialLimit,
      issMaterialLimit: taxCode.issMaterialLimit
    });
    setActiveTab('codigo-tributario');
  };

  const handleDeleteTaxCode = (taxCodeId: string) => {
    setTaxCodes((prev) => prev.filter((taxCode) => taxCode.id !== taxCodeId));
    setDraft((prev) =>
      prev.taxCodeId === taxCodeId
        ? { ...prev, taxCodeId: '', taxCodeCityName: '' }
        : prev
    );
    if (editingTaxCodeId === taxCodeId) {
      setEditingTaxCodeId(null);
      setTaxCodeForm(INITIAL_TAX_CODE_FORM);
    }
    toast.success('Código tributário excluído.');
  };

  const handleSaveDraft = () => {
    if (!canSave) {
      toast.error(
        'Preencha contrato, referência da medição, centro de custo e selecione prestador, tomador, conta bancária e código tributário.'
      );
      return;
    }
    if (editingSavedMirrorId) {
      setSavedDrafts((prev) =>
        prev.map((s) => (s.id === editingSavedMirrorId ? { ...draft, id: editingSavedMirrorId } : s))
      );
      setEditingSavedMirrorId(null);
      setDraft(INITIAL_DRAFT);
      toast.success('Espelho atualizado.');
      return;
    }
    setSavedDrafts((prev) => [{ ...draft, id: newSavedMirrorId() }, ...prev]);
    setDraft(INITIAL_DRAFT);
    toast.success('Espelho salvo.');
  };

  const handleExportDraftExcel = () => {
    if (!canSave) {
      toast.error('Preencha o formulário para exportar o espelho em elaboração.');
      return;
    }
    exportEspelhoNfExcel(draft, serviceProviders, serviceTakers, bankAccounts, taxCodes, federalTaxRates);
    toast.success('Arquivo Excel gerado.');
  };

  const handleExportDraftPdf = () => {
    if (!canSave) {
      toast.error('Preencha o formulário para exportar o espelho em elaboração.');
      return;
    }
    exportEspelhoNfPdf(draft, serviceProviders, serviceTakers, bankAccounts, taxCodes, federalTaxRates);
    toast.success('Arquivo PDF gerado.');
  };

  const handleEditSavedMirror = (saved: SavedMirror) => {
    const { id, ...rest } = saved;
    setDraft(rest);
    setEditingSavedMirrorId(id);
    setActiveTab('espelho');
    toast.success('Altere os campos e clique em Salvar para concluir a edição.');
  };

  const handleDeleteSavedMirror = (id: string) => {
    setSavedDrafts((prev) => prev.filter((s) => s.id !== id));
    if (editingSavedMirrorId === id) {
      setEditingSavedMirrorId(null);
      setDraft(INITIAL_DRAFT);
    }
    toast.success('Espelho excluído.');
  };

  const handleCancelSavedMirrorEdit = () => {
    setEditingSavedMirrorId(null);
    setDraft(INITIAL_DRAFT);
  };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/espelho-nf">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Espelho NF</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Base para emissão de nota fiscal com regras tributárias (em evolução).
            </p>
          </div>

          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-6">
              <button
                type="button"
                onClick={() => setActiveTab('espelho')}
                className={`py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'espelho'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 dark:text-gray-400'
                }`}
              >
                Espelho NF
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('prestadores')}
                className={`py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'prestadores'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 dark:text-gray-400'
                }`}
              >
                Prestadores de Serviço
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('tomadores')}
                className={`py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'tomadores'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 dark:text-gray-400'
                }`}
              >
                Tomadores de Serviço
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('contas-bancarias')}
                className={`py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'contas-bancarias'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 dark:text-gray-400'
                }`}
              >
                Contas Bancárias
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('codigo-tributario')}
                className={`py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'codigo-tributario'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 dark:text-gray-400'
                }`}
              >
                Código Tributário
              </button>
            </nav>
          </div>

          {activeTab === 'espelho' && (
            <Card>
              <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Novo espelho</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleExportDraftExcel}
                      className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm inline-flex items-center gap-1.5"
                    >
                      <Download className="w-4 h-4" />
                      Exportar Excel
                    </button>
                    <button
                      type="button"
                      onClick={handleExportDraftPdf}
                      className="px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm inline-flex items-center gap-1.5"
                    >
                      <Download className="w-4 h-4" />
                      Exportar PDF
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {editingSavedMirrorId && (
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/25">
                    <p className="text-sm text-amber-900 dark:text-amber-100">
                      Você está editando um espelho já salvo. Salve para aplicar ou cancele para descartar as
                      alterações no formulário.
                    </p>
                    <button
                      type="button"
                      onClick={handleCancelSavedMirrorEdit}
                      className="shrink-0 text-sm px-3 py-1.5 rounded-lg border border-amber-700 text-amber-900 hover:bg-amber-100 dark:border-amber-500 dark:text-amber-100 dark:hover:bg-amber-900/40"
                    >
                      Cancelar edição
                    </button>
                  </div>
                )}
                <div className="mb-6 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    Prestador de serviço
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Selecione apenas 1 opção. Clique no card inteiro para marcar.
                  </p>
                  {serviceProviders.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Cadastre pelo menos um prestador na aba Prestadores de Serviço para selecionar no espelho.
                    </p>
                  ) : (
                    <>
                      <div className="relative mb-2">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <input
                          type="search"
                          placeholder="Pesquisar prestador..."
                          value={espelhoProviderSearch}
                          onChange={(e) => setEspelhoProviderSearch(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div className="max-h-64 overflow-y-auto overscroll-y-contain pr-1 space-y-2 [scrollbar-gutter:stable]">
                        {filteredEspelhoProviders.length === 0 ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400 py-2">
                            Nenhum prestador encontrado para a pesquisa.
                          </p>
                        ) : (
                          filteredEspelhoProviders.map((provider) => (
                            <label
                              key={provider.id}
                              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                draft.providerId === provider.id
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={draft.providerId === provider.id}
                                onChange={() =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    providerId: prev.providerId === provider.id ? '' : provider.id,
                                    providerName:
                                      prev.providerId === provider.id ? '' : provider.corporateName
                                  }))
                                }
                                className="h-5 w-5 min-h-5 min-w-5 accent-blue-600 shrink-0"
                              />
                              <span className="text-sm text-gray-800 dark:text-gray-200 break-words">
                                {provider.corporateName} ({provider.cnpj}) - {provider.city}/{provider.state}
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                      Tomador de serviço
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      Selecione apenas 1 opção. Clique no card inteiro para marcar.
                    </p>
                    {serviceTakers.length === 0 ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Cadastre pelo menos um tomador na aba Tomadores de Serviço para selecionar no espelho.
                      </p>
                    ) : (
                      <>
                        <div className="relative mb-2">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                          <input
                            type="search"
                            placeholder="Pesquisar tomador..."
                            value={espelhoTakerSearch}
                            onChange={(e) => setEspelhoTakerSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          />
                        </div>
                        <div className="max-h-64 overflow-y-auto overscroll-y-contain pr-1 space-y-2 [scrollbar-gutter:stable]">
                          {filteredEspelhoTakers.length === 0 ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400 py-2">
                              Nenhum tomador encontrado para a pesquisa.
                            </p>
                          ) : (
                            filteredEspelhoTakers.map((taker) => (
                              <label
                                key={taker.id}
                                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                  draft.takerId === taker.id
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={draft.takerId === taker.id}
                                  onChange={() =>
                                    setDraft((prev) => ({
                                      ...prev,
                                      takerId: prev.takerId === taker.id ? '' : taker.id,
                                      takerName: prev.takerId === taker.id ? '' : taker.corporateName
                                    }))
                                  }
                                  className="h-5 w-5 min-h-5 min-w-5 accent-blue-600 shrink-0"
                                />
                                <span className="text-sm text-gray-800 dark:text-gray-200 break-words">
                                  {taker.name} - {taker.corporateName} ({taker.cnpj}) - Contrato: {taker.contractRef}
                                </span>
                              </label>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                      Código tributário
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      Selecione apenas 1 opção. Clique no card inteiro para marcar.
                    </p>
                    {taxCodes.length === 0 ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Cadastre pelo menos um código na aba Código Tributário para selecionar no espelho.
                      </p>
                    ) : (
                      <>
                        <div className="relative mb-2">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                          <input
                            type="search"
                            placeholder="Pesquisar município ou ISS..."
                            value={espelhoTaxCodeSearch}
                            onChange={(e) => setEspelhoTaxCodeSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          />
                        </div>
                        <div className="max-h-64 overflow-y-auto overscroll-y-contain pr-1 space-y-2 [scrollbar-gutter:stable]">
                          {filteredEspelhoTaxCodes.length === 0 ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400 py-2">
                              Nenhum código encontrado para a pesquisa.
                            </p>
                          ) : (
                            filteredEspelhoTaxCodes.map((taxCode) => (
                              <label
                                key={taxCode.id}
                                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                  draft.taxCodeId === taxCode.id
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={draft.taxCodeId === taxCode.id}
                                  onChange={() =>
                                    setDraft((prev) => ({
                                      ...prev,
                                      taxCodeId: prev.taxCodeId === taxCode.id ? '' : taxCode.id,
                                      taxCodeCityName:
                                        prev.taxCodeId === taxCode.id ? '' : taxCode.cityName
                                    }))
                                  }
                                  className="h-5 w-5 min-h-5 min-w-5 accent-blue-600 shrink-0"
                                />
                                <span className="text-sm text-gray-800 dark:text-gray-200 break-words">
                                  {taxCode.cityName}
                                  {taxCode.abatesMaterial ? ' · Abate material' : ' · Não abate material'} · ISS{' '}
                                  {taxCode.issRate}%
                                </span>
                              </label>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="mb-6 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    Conta bancária
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Selecione apenas 1 opção. Clique no card inteiro para marcar.
                  </p>
                  {bankAccounts.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Cadastre pelo menos uma conta na aba Contas Bancárias para selecionar no espelho.
                    </p>
                  ) : (
                    <>
                      <div className="relative mb-2">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <input
                          type="search"
                          placeholder="Pesquisar conta, banco, agência..."
                          value={espelhoBankSearch}
                          onChange={(e) => setEspelhoBankSearch(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div className="max-h-64 overflow-y-auto overscroll-y-contain pr-1 space-y-2 [scrollbar-gutter:stable]">
                        {filteredEspelhoBankAccounts.length === 0 ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400 py-2">
                            Nenhuma conta encontrada para a pesquisa.
                          </p>
                        ) : (
                          filteredEspelhoBankAccounts.map((account) => (
                            <label
                              key={account.id}
                              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                draft.bankAccountId === account.id
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={draft.bankAccountId === account.id}
                                onChange={() =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    bankAccountId: prev.bankAccountId === account.id ? '' : account.id,
                                    bankAccountName: prev.bankAccountId === account.id ? '' : account.name
                                  }))
                                }
                                className="h-5 w-5 min-h-5 min-w-5 accent-blue-600 shrink-0"
                              />
                              <span className="text-sm text-gray-800 dark:text-gray-200 break-words">
                                {account.name} - {account.bank} | Ag: {account.agency} | C/C: {account.account}
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="Contrato (ex.: Nº 01/2023)"
                    value={draft.contract}
                    onChange={(e) => setDraft((prev) => ({ ...prev, contract: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Referência da medição (ex.: Medição 87 - Abril/2026)"
                    value={draft.measurementRef}
                    onChange={(e) => setDraft((prev) => ({ ...prev, measurementRef: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Centro de custo"
                    value={draft.costCenter}
                    onChange={(e) => setDraft((prev) => ({ ...prev, costCenter: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="date"
                    value={draft.dueDate}
                    onChange={(e) => setDraft((prev) => ({ ...prev, dueDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <textarea
                  rows={4}
                  placeholder="Observações tributárias e notas de montagem do espelho..."
                  value={draft.notes}
                  onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
                  className="mt-4 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {editingSavedMirrorId ? (
                      <Pencil className="w-4 h-4" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    {editingSavedMirrorId ? 'Salvar alterações' : 'Salvar espelho'}
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'prestadores' && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Cadastro de prestador de serviço
                </h3>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    type="text"
                    placeholder="CNPJ *"
                    value={providerForm.cnpj}
                    onChange={(e) => setProviderForm((prev) => ({ ...prev, cnpj: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Inscrição Municipal *"
                    value={providerForm.municipalRegistration}
                    onChange={(e) =>
                      setProviderForm((prev) => ({ ...prev, municipalRegistration: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Inscrição Estadual *"
                    value={providerForm.stateRegistration}
                    onChange={(e) =>
                      setProviderForm((prev) => ({ ...prev, stateRegistration: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Nome/Razão Social *"
                    value={providerForm.corporateName}
                    onChange={(e) =>
                      setProviderForm((prev) => ({ ...prev, corporateName: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 md:col-span-2"
                  />
                  <input
                    type="text"
                    placeholder="Nome Fantasia *"
                    value={providerForm.tradeName}
                    onChange={(e) => setProviderForm((prev) => ({ ...prev, tradeName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Endereço *"
                    value={providerForm.address}
                    onChange={(e) => setProviderForm((prev) => ({ ...prev, address: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 md:col-span-2"
                  />
                  <input
                    type="text"
                    placeholder="Município *"
                    value={providerForm.city}
                    onChange={(e) => setProviderForm((prev) => ({ ...prev, city: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="UF *"
                    value={providerForm.state}
                    onChange={(e) => setProviderForm((prev) => ({ ...prev, state: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="email"
                    placeholder="E-mail"
                    value={providerForm.email}
                    onChange={(e) => setProviderForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleCreateOrUpdateProvider}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    {editingProviderId ? 'Salvar alteração' : 'Cadastrar prestador'}
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'tomadores' && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Cadastro de tomador de serviço
                </h3>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    type="text"
                    placeholder="Nome do Tomador *"
                    value={takerForm.name}
                    onChange={(e) => setTakerForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="CNPJ *"
                    value={takerForm.cnpj}
                    onChange={(e) => setTakerForm((prev) => ({ ...prev, cnpj: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Inscrição Municipal *"
                    value={takerForm.municipalRegistration}
                    onChange={(e) =>
                      setTakerForm((prev) => ({ ...prev, municipalRegistration: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Inscrição Estadual *"
                    value={takerForm.stateRegistration}
                    onChange={(e) =>
                      setTakerForm((prev) => ({ ...prev, stateRegistration: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Nome/Razão Social *"
                    value={takerForm.corporateName}
                    onChange={(e) =>
                      setTakerForm((prev) => ({ ...prev, corporateName: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 md:col-span-2"
                  />
                  <input
                    type="text"
                    placeholder="Contrato *"
                    value={takerForm.contractRef}
                    onChange={(e) => setTakerForm((prev) => ({ ...prev, contractRef: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Endereço *"
                    value={takerForm.address}
                    onChange={(e) => setTakerForm((prev) => ({ ...prev, address: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 md:col-span-2"
                  />
                  <input
                    type="text"
                    placeholder="Município *"
                    value={takerForm.city}
                    onChange={(e) => setTakerForm((prev) => ({ ...prev, city: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="UF *"
                    value={takerForm.state}
                    onChange={(e) => setTakerForm((prev) => ({ ...prev, state: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Discriminação dos serviços *"
                    value={takerForm.serviceDescription}
                    onChange={(e) =>
                      setTakerForm((prev) => ({ ...prev, serviceDescription: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 md:col-span-2"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleCreateOrUpdateTaker}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    {editingTakerId ? 'Salvar alteração' : 'Cadastrar tomador'}
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'contas-bancarias' && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Cadastro de conta bancária
                </h3>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="NOME *"
                    value={bankAccountForm.name}
                    onChange={(e) => setBankAccountForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="BANCO *"
                    value={bankAccountForm.bank}
                    onChange={(e) => setBankAccountForm((prev) => ({ ...prev, bank: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="AGÊNCIA *"
                    value={bankAccountForm.agency}
                    onChange={(e) => setBankAccountForm((prev) => ({ ...prev, agency: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="C/C *"
                    value={bankAccountForm.account}
                    onChange={(e) => setBankAccountForm((prev) => ({ ...prev, account: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleCreateOrUpdateBankAccount}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    {editingBankAccountId ? 'Salvar alteração' : 'Cadastrar conta'}
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'codigo-tributario' && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Cadastro de código tributário
                </h3>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
                  <p className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2">
                    Alíquotas dos Impostos (Gerais)
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Valores em percentual (%). Federais aplicam a todos os municípios.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
                    {([
                      ['cofins', 'COFINS'],
                      ['csll', 'CSLL'],
                      ['inss', 'INSS'],
                      ['irpj', 'IRPJ'],
                      ['pis', 'PIS']
                    ] as const).map(([taxKey, label]) => (
                      <div
                        key={taxKey}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-800/50 px-2.5 py-1.5"
                      >
                        <span className="text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-200 w-11 shrink-0">
                          {label}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="0"
                            value={federalTaxRates[taxKey]}
                            onChange={(e) => handleFederalTaxRateChange(taxKey, e.target.value)}
                            className="w-14 sm:w-16 px-1.5 py-1 text-sm text-right tabular-nums border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          />
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-4 shrink-0">
                            %
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <p className="text-base md:text-lg font-bold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2 mb-2">
                    Cadastro de código do município
                  </p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="space-y-4">
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        <p className="font-medium mb-2">Abate material?</p>
                        <div className="flex items-center gap-6">
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={taxCodeForm.abatesMaterial}
                              onChange={() => setTaxCodeForm((prev) => ({ ...prev, abatesMaterial: true }))}
                              className="h-5 w-5 accent-blue-600"
                            />
                            <span>Sim</span>
                          </label>
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!taxCodeForm.abatesMaterial}
                              onChange={() => setTaxCodeForm((prev) => ({ ...prev, abatesMaterial: false }))}
                              className="h-5 w-5 accent-blue-600"
                            />
                            <span>Não</span>
                          </label>
                        </div>
                      </div>
                      <input
                        type="text"
                        placeholder="Nome do Município *"
                        value={taxCodeForm.cityName}
                        onChange={(e) => setTaxCodeForm((prev) => ({ ...prev, cityName: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      />
                      {taxCodeForm.abatesMaterial && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <input
                            type="text"
                            placeholder="Limite Material INSS (%) *"
                            value={taxCodeForm.inssMaterialLimit}
                            onChange={(e) =>
                              setTaxCodeForm((prev) => ({
                                ...prev,
                                inssMaterialLimit: formatPercentInput(e.target.value)
                              }))
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          />
                          <input
                            type="text"
                            placeholder="Limite Material ISS (%) *"
                            value={taxCodeForm.issMaterialLimit}
                            onChange={(e) =>
                              setTaxCodeForm((prev) => ({
                                ...prev,
                                issMaterialLimit: formatPercentInput(e.target.value)
                              }))
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          />
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2.5">
                      <p className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-1.5 mb-1.5">
                        Impostos (apenas tipo por município)
                      </p>
                      {([
                        ['iss', 'ISS'],
                        ['cofins', 'COFINS'],
                        ['csll', 'CSLL'],
                        ['inss', 'INSS'],
                        ['irpj', 'IRPJ'],
                        ['pis', 'PIS']
                      ] as const).map(([taxKey, label]) => (
                        <div
                          key={taxKey}
                          className="grid grid-cols-1 md:grid-cols-[110px_220px_220px] md:justify-start gap-2 items-center"
                        >
                          <p className="text-xs font-semibold tracking-wide text-gray-800 dark:text-gray-200">
                            {label}
                          </p>
                          {taxKey === 'iss' ? (
                            <input
                              type="text"
                              placeholder="Alíquota ISS (%) *"
                              value={taxCodeForm.issRate}
                              onChange={(e) =>
                                setTaxCodeForm((prev) => ({
                                  ...prev,
                                  issRate: formatPercentInput(e.target.value)
                                }))
                              }
                              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                            />
                          ) : (
                            <input
                              type="text"
                              value={
                                federalTaxRates[taxKey as Exclude<keyof FederalTaxRates, 'iss'>]
                                  ? `${federalTaxRates[taxKey as Exclude<keyof FederalTaxRates, 'iss'>]}%`
                                  : ''
                              }
                              readOnly
                              placeholder={`Alíquota ${label} (%)`}
                              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 cursor-not-allowed"
                            />
                          )}
                          <select
                            value={taxCodeForm[taxKey].collectionType}
                            onChange={(e) =>
                              handleTaxRuleFieldChange(taxKey, e.target.value as 'RETIDO' | 'RECOLHIDO')
                            }
                            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          >
                            <option value="RETIDO">Retido</option>
                            <option value="RECOLHIDO">Recolhido</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleCreateOrUpdateTaxCode}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    {editingTaxCodeId ? 'Salvar alteração' : 'Cadastrar código tributário'}
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'espelho' ? (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Espelho criado</h3>
              </CardHeader>
              <CardContent className="p-6">
                {savedDrafts.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Nenhum espelho salvo ainda. Use o formulário acima para criar a base.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[min(28rem,70vh)] overflow-y-auto pr-1">
                    {savedDrafts.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                      >
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.contract}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {item.measurementRef} | CC: {item.costCenter} | Prestador: {item.providerName} | Tomador:{' '}
                          {item.takerName} | Conta: {item.bankAccountName} | Cód. trib.:{' '}
                          {item.taxCodeCityName}{' '}
                          {item.dueDate ? `| Vencimento: ${item.dueDate}` : ''}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setDetailMirror(item)}
                            className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800 inline-flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            Ver detalhes
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditSavedMirror(item)}
                            className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20 inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSavedMirror(item.id)}
                            className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            Excluir
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              exportEspelhoNfExcel(
                                item,
                                serviceProviders,
                                serviceTakers,
                                bankAccounts,
                                taxCodes,
                                federalTaxRates
                              );
                              toast.success('Arquivo Excel gerado.');
                            }}
                            className="text-xs px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20 inline-flex items-center gap-1"
                          >
                            <FileSpreadsheet className="w-3 h-3" />
                            Excel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              exportEspelhoNfPdf(
                                item,
                                serviceProviders,
                                serviceTakers,
                                bankAccounts,
                                taxCodes,
                                federalTaxRates
                              );
                              toast.success('Arquivo PDF gerado.');
                            }}
                            className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 inline-flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3" />
                            PDF
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : activeTab === 'prestadores' ? (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Prestadores de serviço criados
                </h3>
              </CardHeader>
              <CardContent className="p-6">
                {serviceProviders.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Nenhum prestador cadastrado ainda.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {serviceProviders.map((provider) => (
                      <div
                        key={provider.id}
                        className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {provider.corporateName}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            CNPJ: {provider.cnpj} | Município: {provider.city}/{provider.state}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditProvider(provider)}
                            className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20 inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProvider(provider.id)}
                            className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : activeTab === 'tomadores' ? (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Tomadores de serviço criados
                </h3>
              </CardHeader>
              <CardContent className="p-6">
                {serviceTakers.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Nenhum tomador cadastrado ainda.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {serviceTakers.map((taker) => (
                      <div
                        key={taker.id}
                        className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {taker.name}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Razão Social: {taker.corporateName} | CNPJ: {taker.cnpj} | Contrato: {taker.contractRef}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditTaker(taker)}
                            className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20 inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTaker(taker.id)}
                            className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : activeTab === 'contas-bancarias' ? (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Contas bancárias criadas
                </h3>
              </CardHeader>
              <CardContent className="p-6">
                {bankAccounts.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Nenhuma conta bancária cadastrada ainda.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {bankAccounts.map((account) => (
                      <div
                        key={account.id}
                        className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {account.name}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Banco: {account.bank} | Agência: {account.agency} | C/C: {account.account}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditBankAccount(account)}
                            className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20 inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteBankAccount(account.id)}
                            className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Códigos tributários criados
                </h3>
              </CardHeader>
              <CardContent className="p-6">
                {taxCodes.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Nenhum código tributário cadastrado ainda.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {taxCodes.map((taxCode) => (
                      <div
                        key={taxCode.id}
                        className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {taxCode.cityName}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {taxCode.abatesMaterial ? 'Abate material' : 'Não abate material'}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            COFINS ({taxCode.cofins.collectionType}) | CSLL ({taxCode.csll.collectionType}) | INSS (
                            {taxCode.inss.collectionType}) | IRPJ ({taxCode.irpj.collectionType}) | PIS (
                            {taxCode.pis.collectionType}) | ISS ({taxCode.iss.collectionType})
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Alíquotas gerais: COFINS {federalTaxRates.cofins || '-'}% | CSLL{' '}
                            {federalTaxRates.csll || '-'}% | INSS {federalTaxRates.inss || '-'}% | IRPJ{' '}
                            {federalTaxRates.irpj || '-'}% | PIS {federalTaxRates.pis || '-'}%
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Alíquota ISS (município): {taxCode.issRate || '-'}%
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Limite Material INSS: {taxCode.inssMaterialLimit}% | Limite Material ISS:{' '}
                            {taxCode.issMaterialLimit}%
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditTaxCode(taxCode)}
                            className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20 inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTaxCode(taxCode.id)}
                            className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {detailMirror && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
              role="dialog"
              aria-modal="true"
              aria-labelledby="espelho-detalhe-titulo"
            >
              <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label="Fechar"
                onClick={() => setDetailMirror(null)}
              />
              <div className="relative z-10 flex w-full max-w-lg max-h-[min(90vh,40rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3 shrink-0">
                  <h4
                    id="espelho-detalhe-titulo"
                    className="text-base font-semibold text-gray-900 dark:text-gray-100 pr-2"
                  >
                    Detalhes do espelho
                  </h4>
                  <button
                    type="button"
                    onClick={() => setDetailMirror(null)}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="overflow-y-auto p-4 space-y-3 text-sm">
                  {buildEspelhoDetailRows(detailMirror).map(([label, value]) => (
                    <div
                      key={label}
                      className="grid grid-cols-1 gap-1 border-b border-gray-100 pb-3 dark:border-gray-800 sm:grid-cols-[10rem_1fr] sm:gap-3"
                    >
                      <span className="font-medium text-gray-700 dark:text-gray-300">{label}</span>
                      <span className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 border-t border-gray-200 dark:border-gray-700 px-4 py-3 shrink-0 bg-gray-50 dark:bg-gray-900/80">
                  <button
                    type="button"
                    onClick={() => {
                      exportEspelhoNfExcel(
                        detailMirror,
                        serviceProviders,
                        serviceTakers,
                        bankAccounts,
                        taxCodes,
                        federalTaxRates
                      );
                      toast.success('Arquivo Excel gerado.');
                    }}
                    className="text-xs px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Exportar Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      exportEspelhoNfPdf(
                        detailMirror,
                        serviceProviders,
                        serviceTakers,
                        bankAccounts,
                        taxCodes,
                        federalTaxRates
                      );
                      toast.success('Arquivo PDF gerado.');
                    }}
                    className="text-xs px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 inline-flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Exportar PDF
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
