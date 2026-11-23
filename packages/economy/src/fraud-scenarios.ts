// Educational fraud scenarios. Everything stays inside Bankoo: no real links, no real codes, no real brands.
export interface FraudScenario {
  id: string; ages: [number, number]; sender: string; subject: string; body: string;
  redFlags: string[]; choices: { id: string; label: string; safe: boolean; feedback: string }[];
}

const STD_CHOICES = (unsafeLabel: string) => [
  { id: 'open-link', label: unsafeLabel, safe: false, feedback: 'كانت هذه رسالة خداع! لا تقلق، نحن نتدرب في عالم آمن.' },
  { id: 'check-sender', label: 'أتحقق من الجهة المرسلة', safe: true, feedback: 'أحسنت! المرسل غريب ولا يشبه بنك بنكوو الحقيقي.' },
  { id: 'ask-teacher', label: 'أطلب المساعدة من المعلم', safe: true, feedback: 'قرار ذكي! طلب المساعدة من شخص بالغ تثق به هو دائمًا خيار آمن.' },
  { id: 'report', label: 'أبلغ عن رسالة مشبوهة', safe: true, feedback: 'رائع! الإبلاغ يحميك ويحمي أصدقاءك.' },
];

export const FRAUD_SCENARIOS: FraudScenario[] = [
  {
    id: 'fake-prize-50', ages: [6, 16], sender: 'جوائز بنكوو الكبرى ⭐', subject: 'مبروك!!',
    body: 'مبروك! لقد ربحت 50 بانكوز! اضغط هنا للحصول على جائزتك فورًا.',
    redFlags: ['جائزة لم تشارك في أي مسابقة للحصول عليها', 'يطلب منك الضغط فورًا وبسرعة', 'المرسل ليس بنكوو الحقيقي'],
    choices: STD_CHOICES('أفتح الرسالة وأتبع التعليمات'),
  },
  {
    id: 'secret-code', ages: [9, 16], sender: 'خدمة البطاقات', subject: 'بطاقتك ستتوقف اليوم',
    body: 'بطاقة بنكوو الخاصة بك ستتوقف خلال ساعة! أرسل لنا رمزك السري الآن لتفعيلها.',
    redFlags: ['لا أحد يطلب رمزك السري، ولا حتى البنك', 'تهديد ومهلة قصيرة جدًا', 'رسالة بلا اسمك'],
    choices: STD_CHOICES('أرسل الرمز حتى لا تتوقف البطاقة'),
  },
  {
    id: 'too-good-offer', ages: [9, 16], sender: 'متجر العجائب', subject: 'تخفيض 90%',
    body: 'هاتف ذكي بـ 3 بانكوز فقط! العرض لأول 5 أشخاص. ادفع الآن قبل نفاد الكمية.',
    redFlags: ['السعر أقل بكثير من المعقول', 'ضغط بالوقت والكمية', 'متجر غير معروف خارج دكان بنكوو'],
    choices: STD_CHOICES('أدفع بسرعة قبل نفاد العرض'),
  },
  {
    id: 'fake-shop', ages: [13, 16], sender: 'دكّان بنكو (بنون واحدة)', subject: 'طلبك ينتظر الدفع',
    body: 'طلبك جاهز. أدخل رقم بطاقة والديك لإكمال التوصيل.',
    redFlags: ['اسم المتجر مكتوب بشكل مختلف قليلًا', 'يطلب بيانات بطاقة شخص آخر', 'أنت لم تطلب شيئًا'],
    choices: STD_CHOICES('أدخل البيانات لأحصل على الطلب'),
  },
];
