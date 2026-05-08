import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/bootstrap', async (_req, res, next) => {
  try {
    const p = prisma as any;
    const [providers, takers, bankAccounts, taxCodes, mirrors] = await Promise.all([
      p.espelhoNfServiceProvider.findMany({ orderBy: { createdAt: 'desc' } }),
      p.espelhoNfServiceTaker.findMany({ orderBy: { createdAt: 'desc' } }),
      p.espelhoNfBankAccount.findMany({ orderBy: { createdAt: 'desc' } }),
      p.espelhoNfTaxCode.findMany({ orderBy: { createdAt: 'desc' } }),
      p.espelhoNfMirror.findMany({ orderBy: { createdAt: 'desc' } })
    ]);

    return res.status(200).json({
      success: true,
      data: {
        providers,
        takers,
        bankAccounts,
        taxCodes: taxCodes.map((t: any) => ({
          id: t.id,
          cityName: t.name,
          abatesMaterial: t.abatesMaterial,
          issRate: t.issRate,
          cofins: { collectionType: t.cofinsCollectionType },
          csll: { collectionType: t.csllCollectionType },
          inss: { collectionType: t.inssCollectionType },
          irpj: { collectionType: t.irpjCollectionType },
          pis: { collectionType: t.pisCollectionType },
          iss: { collectionType: t.issCollectionType },
          inssMaterialLimit: t.inssMaterialLimit,
          issMaterialLimit: t.issMaterialLimit
        })),
        mirrors: mirrors.map((m: any) => ({
          id: m.id,
          createdAt: m.createdAt?.toISOString?.() ?? m.createdAt,
          measurementRef: m.measurementRef ?? '',
          costCenterId: m.costCenterId ?? '',
          dueDate: m.dueDate ? new Date(m.dueDate).toISOString().slice(0, 10) : '',
          municipality: m.municipality ?? '',
          cnae: m.cnae ?? '41.20-4-00',
          serviceIssqn: m.serviceIssqn ?? '',
          empenhoNumber: m.empenhoNumber ?? '',
          processNumber: m.processNumber ?? '',
          serviceOrder: m.serviceOrder ?? '',
          measurementStartDate: m.measurementStartDate ?? '',
          measurementEndDate: m.measurementEndDate ?? '',
          buildingUnit: m.buildingUnit ?? '',
          observations: m.observations ?? '',
          notes: m.notes ?? '',
          measurementAmount: m.measurementAmount ?? '',
          laborAmount: m.laborAmount ?? '',
          materialAmount: m.materialAmount ?? '',
          providerId: m.providerId ?? '',
          providerName: '',
          takerId: m.takerId ?? '',
          takerName: '',
          bankAccountId: m.bankAccountId ?? '',
          bankAccountName: '',
          taxCodeId: m.taxCodeId ?? '',
          taxCodeCityName: '',
          nfAttachment:
            m.nfAttachmentDataUrl && m.nfAttachmentName
              ? {
                  name: m.nfAttachmentName,
                  mimeType: m.nfAttachmentMimeType ?? 'application/octet-stream',
                  size: m.nfAttachmentSize ?? 0,
                  dataUrl: m.nfAttachmentDataUrl
                }
              : undefined,
          xmlAttachment:
            m.xmlAttachmentDataUrl && m.xmlAttachmentName
              ? {
                  name: m.xmlAttachmentName,
                  mimeType: m.xmlAttachmentMimeType ?? 'application/octet-stream',
                  size: m.xmlAttachmentSize ?? 0,
                  dataUrl: m.xmlAttachmentDataUrl
                }
              : undefined
        }))
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/bootstrap', async (req, res, next) => {
  try {
    const p = prisma as any;
    const mirrorHasCnae = Boolean(
      p?._runtimeDataModel?.models?.EspelhoNfMirror?.fields?.some((field: any) => field?.name === 'cnae')
    );
    const mirrorHasMunicipality = Boolean(
      p?._runtimeDataModel?.models?.EspelhoNfMirror?.fields?.some(
        (field: any) => field?.name === 'municipality'
      )
    );
    const mirrorHasServiceIssqn = Boolean(
      p?._runtimeDataModel?.models?.EspelhoNfMirror?.fields?.some(
        (field: any) => field?.name === 'serviceIssqn'
      )
    );
    const mirrorHasMeasurementStartDate = Boolean(
      p?._runtimeDataModel?.models?.EspelhoNfMirror?.fields?.some(
        (field: any) => field?.name === 'measurementStartDate'
      )
    );
    const mirrorHasMeasurementEndDate = Boolean(
      p?._runtimeDataModel?.models?.EspelhoNfMirror?.fields?.some(
        (field: any) => field?.name === 'measurementEndDate'
      )
    );
    const {
      providers = [],
      takers = [],
      bankAccounts = [],
      taxCodes = [],
      mirrors = []
    } = (req.body || {}) as Record<string, any[]>;
    const takerHasMunicipality = Boolean(
      p?._runtimeDataModel?.models?.EspelhoNfServiceTaker?.fields?.some(
        (field: any) => field?.name === 'municipality'
      )
    );

    if (
      !p.espelhoNfMirror ||
      !p.espelhoNfServiceTaker ||
      !p.espelhoNfServiceProvider ||
      !p.espelhoNfBankAccount ||
      !p.espelhoNfTaxCode
    ) {
      throw new Error('Prisma Client desatualizado para o módulo Espelho NF. Reinicie o backend.');
    }

    const ops: any[] = [
      p.espelhoNfMirror.deleteMany(),
      p.espelhoNfServiceTaker.deleteMany(),
      p.espelhoNfServiceProvider.deleteMany(),
      p.espelhoNfBankAccount.deleteMany(),
      p.espelhoNfTaxCode.deleteMany()
    ];

    if (providers.length > 0) {
      ops.push(
        p.espelhoNfServiceProvider.createMany({
          data: providers.map((item: any) => ({
            id: String(item.id),
            cnpj: String(item.cnpj ?? ''),
            municipalRegistration: String(item.municipalRegistration ?? ''),
            stateRegistration: String(item.stateRegistration ?? ''),
            corporateName: String(item.corporateName ?? ''),
            tradeName: String(item.tradeName ?? ''),
            address: String(item.address ?? ''),
            city: String(item.city ?? ''),
            state: String(item.state ?? ''),
            email: item.email ? String(item.email) : null
          }))
        })
      );
    }

    if (bankAccounts.length > 0) {
      ops.push(
        p.espelhoNfBankAccount.createMany({
          data: bankAccounts.map((item: any) => ({
            id: String(item.id),
            name: String(item.name ?? ''),
            bank: String(item.bank ?? ''),
            agency: String(item.agency ?? ''),
            account: String(item.account ?? '')
          }))
        })
      );
    }

    if (taxCodes.length > 0) {
      ops.push(
        p.espelhoNfTaxCode.createMany({
          data: taxCodes.map((item: any) => ({
            id: String(item.id),
            name: String(item.cityName ?? ''),
            abatesMaterial: Boolean(item.abatesMaterial),
            issRate: String(item.issRate ?? ''),
            cofinsCollectionType: String(item?.cofins?.collectionType ?? 'RETIDO'),
            csllCollectionType: String(item?.csll?.collectionType ?? 'RETIDO'),
            inssCollectionType: String(item?.inss?.collectionType ?? 'RETIDO'),
            irpjCollectionType: String(item?.irpj?.collectionType ?? 'RETIDO'),
            pisCollectionType: String(item?.pis?.collectionType ?? 'RETIDO'),
            issCollectionType: String(item?.iss?.collectionType ?? 'RETIDO'),
            inssMaterialLimit: String(item.inssMaterialLimit ?? ''),
            issMaterialLimit: String(item.issMaterialLimit ?? '')
          }))
        })
      );
    }

    if (takers.length > 0) {
      ops.push(
        p.espelhoNfServiceTaker.createMany({
          data: takers.map((item: any) => ({
            id: String(item.id),
            name: String(item.name ?? ''),
            cnpj: String(item.cnpj ?? ''),
            municipalRegistration: String(item.municipalRegistration ?? ''),
            stateRegistration: String(item.stateRegistration ?? ''),
            corporateName: String(item.corporateName ?? ''),
            costCenterId: String(item.costCenterId ?? ''),
            taxCodeId: String(item.taxCodeId ?? ''),
            bankAccountId: String(item.bankAccountId ?? ''),
            address: String(item.address ?? ''),
            ...(takerHasMunicipality
              ? { municipality: String(item.municipality ?? item.city ?? '') }
              : {}),
            city: String(item.city ?? ''),
            state: String(item.state ?? ''),
            contractRef: String(item.contractRef ?? ''),
            serviceDescription: String(item.serviceDescription ?? '')
          }))
        })
      );
    }

    if (mirrors.length > 0) {
      ops.push(
        p.espelhoNfMirror.createMany({
          data: mirrors.map((item: any) => ({
            id: String(item.id),
            measurementRef: String(item.measurementRef ?? ''),
            costCenterId: String(item.costCenterId ?? ''),
            dueDate: item.dueDate ? new Date(String(item.dueDate)) : null,
            ...(mirrorHasMunicipality ? { municipality: String(item.municipality ?? '') } : {}),
            ...(mirrorHasCnae ? { cnae: item.cnae ? String(item.cnae) : '41.20-4-00' } : {}),
            ...(mirrorHasServiceIssqn
              ? { serviceIssqn: item.serviceIssqn ? String(item.serviceIssqn) : null }
              : {}),
            empenhoNumber: item.empenhoNumber ? String(item.empenhoNumber) : null,
            processNumber: item.processNumber ? String(item.processNumber) : null,
            serviceOrder: item.serviceOrder ? String(item.serviceOrder) : null,
            ...(mirrorHasMeasurementStartDate
              ? { measurementStartDate: item.measurementStartDate ? String(item.measurementStartDate) : null }
              : {}),
            ...(mirrorHasMeasurementEndDate
              ? { measurementEndDate: item.measurementEndDate ? String(item.measurementEndDate) : null }
              : {}),
            buildingUnit: item.buildingUnit ? String(item.buildingUnit) : null,
            observations: item.observations ? String(item.observations) : null,
            notes: item.notes ? String(item.notes) : null,
            measurementAmount: String(item.measurementAmount ?? ''),
            laborAmount: String(item.laborAmount ?? ''),
            materialAmount: String(item.materialAmount ?? ''),
            providerId: String(item.providerId ?? ''),
            takerId: String(item.takerId ?? ''),
            bankAccountId: String(item.bankAccountId ?? ''),
            taxCodeId: String(item.taxCodeId ?? ''),
            createdAt: item.createdAt ? new Date(String(item.createdAt)) : undefined,
            nfAttachmentName: item?.nfAttachment?.name ? String(item.nfAttachment.name) : null,
            nfAttachmentMimeType: item?.nfAttachment?.mimeType ? String(item.nfAttachment.mimeType) : null,
            nfAttachmentSize:
              item?.nfAttachment?.size != null && Number.isFinite(Number(item.nfAttachment.size))
                ? Number(item.nfAttachment.size)
                : null,
            nfAttachmentDataUrl: item?.nfAttachment?.dataUrl ? String(item.nfAttachment.dataUrl) : null,
            xmlAttachmentName: item?.xmlAttachment?.name ? String(item.xmlAttachment.name) : null,
            xmlAttachmentMimeType: item?.xmlAttachment?.mimeType ? String(item.xmlAttachment.mimeType) : null,
            xmlAttachmentSize:
              item?.xmlAttachment?.size != null && Number.isFinite(Number(item.xmlAttachment.size))
                ? Number(item.xmlAttachment.size)
                : null,
            xmlAttachmentDataUrl: item?.xmlAttachment?.dataUrl ? String(item.xmlAttachment.dataUrl) : null
          }))
        })
      );
    }

    await p.$transaction(ops);

    return res.status(200).json({ success: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
