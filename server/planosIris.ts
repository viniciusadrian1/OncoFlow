// Planos terapêuticos fictícios do protótipo IRIS (src/mockData.ts), traduzidos para EN-US.
// São documentos da equipe: aparecem só no OncoFlow Pro e não alimentam respostas ao paciente.

export const PLANOS_IRIS: Record<string, string> = {
  'pac-001': `Patient: José Pereira da Silva, 64 years old, retired, former farm worker. Did not finish elementary school. Lives with his wife Maria, his main caregiver. Uses WhatsApp easily and prefers voice messages to text. Simple, direct communication. Not familiar with medical terminology.

Diagnosis: Non-small cell lung carcinoma (NSCLC), stage IV, with metastases. EGFR mutation positive.

Treatment goal: Disease control and longer survival. Non-curative treatment, focused on quality of life and time.

Current regimen:
Chemotherapy every 21 days: Carboplatin AUC5 IV D1. Pemetrexed 500 mg/m² IV D1.
Continuous targeted therapy: Gefitinib 250 mg PO once a day, every day, without interruption, regardless of chemotherapy cycles.
Required support for pemetrexed: Folic acid 5 mg PO once a day. Vitamin B12 1000 mcg IM every 9 weeks.

Comorbidities: Former smoker. Mild COPD. Controlled hypertension.
Ongoing medications: Losartan 50 mg once a day. Albuterol inhaler as needed. No known allergies.

Home support medications:
Ondansetron 8 mg PO every 8 h for nausea. Loperamide 4 mg after the first loose stool, then 2 mg after each loose stool, up to 16 mg/day. Fragrance-free body moisturizer twice a day. Sunscreen SPF 30 or higher, daily. Dipyrone 1 g PO every 6 h for pain.

Hydration goal: 2 liters per day.

Expected toxicities: Skin rash (common with gefitinib, first weeks, face/neck/trunk). Gefitinib-related diarrhea. Dry skin and brittle nails. Nausea and fatigue D1 to D5. Myelosuppression, with higher risk in the first week after chemotherapy.

Warning signs: Shortness of breath or worsening breathing (risk of gefitinib interstitial pneumonitis). Fever above 37.8 °C (100 °F). Severe diarrhea or diarrhea that does not improve with loperamide. Inability to keep fluids down. Very extensive rash, with blisters or sores. Exhaustion that prevents basic activities. Stopping gefitinib on his own.`,
  'pac-002': `Patient: Renato Oliveira Santos, 57 years old, driver. Finished high school. Lives with his wife Carla, his main caregiver. Practical profile, direct communication.

Diagnosis: Sigmoid colon adenocarcinoma, resected. Pathological staging pT3N1M0. Post-operative, no evidence of disease.

Treatment goal: Curative. Strategy: Adjuvant therapy to reduce the risk of recurrence after surgery.

Current regimen:
FOLFOX, cycles every 14 days. 12 cycles planned (6 months). Oxaliplatin 85 mg/m² IV D1. Leucovorin 400 mg/m² IV D1. 5-FU bolus 400 mg/m² IV D1. Continuous 5-FU 2400 mg/m² over 46 h through an elastomeric infusion pump; the patient goes home with the pump on D1 and returns for removal on D3.

Comorbidities: Controlled hypertension. Ongoing medication: Enalapril 10 mg once a day. No known allergies.

Home support medications:
Ondansetron 8 mg PO every 8 h for nausea. Loperamide 4 mg after the first loose stool, then 2 mg after each loose stool, up to 16 mg/day. Lactulose 20 mL at night for constipation. Dipyrone 1 g PO every 6 h for pain. Baking soda mouth rinses 4 times a day for mouth discomfort.

Hydration goal: 2 liters per day.

Important guidance: In the first days after the infusion (D1 to D3), avoid exposure to cold: cold drinks, cold food, cold surfaces, strong air conditioning. Oxaliplatin causes cold-triggered sensory neuropathy, which is expected and temporary.

Expected toxicities: Nausea and abdominal discomfort D1 to D3. Cumulative fatigue over the cycles. Frequent diarrhea with 5-FU, from D2. Mild mucositis. Temporary peripheral neuropathy: tingling in hands and feet, especially with cold, D1 to D5.

Warning signs: Severe diarrhea or diarrhea that does not respond to loperamide. Fever above 37.8 °C (100 °F). Inability to keep fluids down. Neuropathy that prevents basic activities. Mucositis that prevents eating. Significant exhaustion. Any problem with the infusion pump: leaking, disconnection, pain at the site.`,
  'pac-003': `Patient: Ana Silva, 42 years old, elementary school teacher. College degree. Lives with her husband João, her main caregiver.

Diagnosis: Invasive carcinoma of the right breast, cT2N1M0, Luminal B subtype, HER2 negative. Recent diagnosis, first experience with chemotherapy.

Treatment goal: Curative. Strategy: Neoadjuvant therapy to shrink the tumor before surgery.

Current regimen:
Dose-dense AC, cycles every 14 days. Doxorubicin 60 mg/m² IV D1. Cyclophosphamide 600 mg/m² IV D1. Filgrastim 300 mcg SC D2 to D7, given at home by the patient or her husband, who have been taught the technique.

Comorbidities: Controlled hypertension. Ongoing medication: Losartan 50 mg once a day. No known allergies.

Home support medications:
Ondansetron 8 mg PO every 8 h for nausea. Dexamethasone 4 mg PO every 12 h for 3 days after each cycle. Omeprazole 20 mg in the morning. Dipyrone 1 g PO every 6 h for pain. Loperamide for diarrhea. Lactulose 20 mL at night if no bowel movement for more than 48 h. Baking soda mouth rinses 4 times a day for mouth discomfort.

Hydration goal: 2 liters per day.

Expected toxicities: Nausea and vomiting, especially D1 to D3. Progressive fatigue over the cycles. Hair loss, expected to start between D14 and D21. Filgrastim-related bone pain, typically D3 to D5, manageable with dipyrone. Mild to moderate mucositis. Constipation or diarrhea.

Warning signs: Fever, any value above 37.8 °C (100 °F), especially between D5 and D10 (lowest neutrophil count). Vomiting that prevents any oral intake. Inability to drink fluids for more than 12 hours. Exhaustion that prevents basic activities. Sudden chills, shaking or intense malaise. Mouth pain that prevents eating. Shortness of breath or chest pain.`,
};
