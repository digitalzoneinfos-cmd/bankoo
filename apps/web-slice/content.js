// BANKOO — curriculum content for the vertical slice.
// Scenes: talk | choose | sort | count | goal | summary.  minAge/maxAge adapt a scene to the age band.
// Every "check" scene has a hint and a re-explanation with a different example (spec §4, §9).
window.BK = {};

BK.zones = [
  { id: 1, title: 'مدينة البدايات' }, { id: 2, title: 'غابة الادخار' }, { id: 3, title: 'سوق بنكوو' },
  { id: 4, title: 'مدينة المدفوعات' }, { id: 5, title: 'قلعة الأمان المالي' }, { id: 6, title: 'عالم المستقبل' },
];

// Map nodes — position in % of the drawn map (x from left, y from top), order = unlock order.
BK.nodes = [
  { n: 1, zone: 1, x: 33.9, y: 18.7, lesson: 'z1-money', title: 'ما هو المال؟' },
  { n: 2, zone: 1, x: 44.3, y: 18.7, lesson: 'z1-bankooz', title: 'ما هي بانكوز؟' },
  { n: 3, zone: 1, x: 54.8, y: 18.7, lesson: 'z1-earn', title: 'كيف نربح المال؟' },
  { n: 4, zone: 1, x: 66.0, y: 18.7, lesson: 'z1-needs', title: 'الحاجة أم الرغبة؟' },
  { n: 5, zone: 2, x: 8.9, y: 43.9, title: 'لماذا ندخر؟' },
  { n: 6, zone: 2, x: 19.0, y: 43.9, lesson: 'z2-bag', title: 'هدف الادخار' },
  { n: 7, zone: 2, x: 29.4, y: 43.9, title: 'قسّم مصروفك' },
  { n: 8, zone: 2, x: 39.7, y: 43.9, title: 'اصبر لتشتري' },
  { n: 9, zone: 3, x: 60.6, y: 44.6, title: 'الأسعار والمنتجات' },
  { n: 10, zone: 3, x: 71.3, y: 44.6, title: 'أقارن قبل الشراء' },
  { n: 11, zone: 3, x: 81.6, y: 44.6, title: 'السلة والفاتورة' },
  { n: 12, zone: 3, x: 90.9, y: 44.6, title: 'شراء ذكي' },
  { n: 13, zone: 4, x: 8.5, y: 68.5, title: 'ما هي البطاقة؟' },
  { n: 14, zone: 4, x: 18.7, y: 68.5, title: 'الدفع الإلكتروني' },
  { n: 15, zone: 4, x: 29.0, y: 68.5, title: 'الدفع عبر QR' },
  { n: 16, zone: 4, x: 39.0, y: 68.5, title: 'الدفع عبر الهاتف' },
  { n: 17, zone: 5, x: 57.5, y: 68.8, title: 'احمِ معلوماتك' },
  { n: 18, zone: 5, x: 67.9, y: 68.8, title: 'اكتشف الاحتيال' },
  { n: 19, zone: 5, x: 78.3, y: 68.8, title: 'الرسائل المشبوهة' },
  { n: 20, zone: 5, x: 88.2, y: 68.8, title: 'اطلب المساعدة' },
  { n: 21, zone: 6, x: 29.0, y: 84.5, title: 'خطط لميزانيتك' },
  { n: 22, zone: 6, x: 39.7, y: 84.5, title: 'ادفع فواتيرك' },
  { n: 23, zone: 6, x: 50.4, y: 84.5, title: 'أنجز هدفك' },
  { n: 24, zone: 6, x: 63.7, y: 84.5, title: 'المغامرة النهائية' },
];

const A = p => `assets/${p}.webp`;

BK.lessons = {
  'z1-money': {
    title: 'ما هو المال؟', objective: 'يميّز الطفل أن المال وسيلة لتبادل الأشياء التي نحتاجها.', reward: 3,
    scenes: [
      { t: 'talk', pose: 'welcome', text: 'أهلًا يا {name}! اليوم سنكتشف سرًّا صغيرًا: ما هو المال؟' },
      { t: 'talk', pose: 'explain', img: A('ic-coins'), text: 'المال هو ما نعطيه للبائع لنأخذ ما نحتاجه. أمي تعطي الخبّاز نقودًا، والخبّاز يعطيها الخبز.' },
      { t: 'choose', pose: 'think', q: 'بماذا نشتري الخبز من المخبزة؟',
        opts: [{ label: 'بالنقود', img: A('ic-coins'), ok: 1 }, { label: 'بورقة شجرة', ok: 0 }, { label: 'بحجر صغير', ok: 0 }],
        hint: 'فكّر: ماذا تعطي أمي للخبّاز؟',
        wrong: 'لنجرب مثالًا آخر: عندما نركب الحافلة، ندفع للسائق نقودًا وليس أوراق شجر. النقود هي المال!' },
      { t: 'choose', pose: 'think', minAge: 9, q: 'لماذا نستعمل المال بدل أن نتبادل الأشياء مباشرة؟',
        opts: [{ label: 'لأنه أسهل: الخبّاز لا يحتاج دائمًا ما عندنا', ok: 1 }, { label: 'لأن المال جميل الشكل', ok: 0 }],
        hint: 'تخيّل أن معك قلمًا، والخبّاز لا يحتاج قلمًا…',
        wrong: 'لو أردت خبزًا ومعك كرة، ربما لا يريد الخبّاز كرة! المال يقبله الجميع، لذلك يسهّل التبادل.' },
      { t: 'summary', pose: 'correct', points: ['المال نستعمله لنحصل على ما نحتاجه.', 'نعطي المال للبائع، ويعطينا ما نشتريه.'] },
    ],
  },
  'z1-bankooz': {
    title: 'ما هي بانكوز؟', objective: 'يفرّق الطفل بين الدينار الجزائري الحقيقي وبانكوز الافتراضية.', reward: 3,
    scenes: [
      { t: 'talk', pose: 'pay', img: A('coin'), text: 'هذه بانكوز! عملتنا الخاصة في عالم بنكوو. نتدرّب بها لنتعلّم، تمامًا كما يتدرّب لاعب الكرة قبل المباراة.' },
      { t: 'talk', pose: 'explain', text: 'في الجزائر نستعمل الدينار الجزائري لنشتري الخبز والأدوات حقًا. أما بانكوز فتعيش داخل بنكوو فقط.' },
      { t: 'sort', pose: 'think', q: 'ضع كل جملة في مكانها:', bins: ['الدينار الجزائري', 'بانكوز'],
        items: [{ label: 'أشتري به خبزًا حقيقيًا', bin: 0 }, { label: 'أتدرّب به في بنكوو', bin: 1 },
                { label: 'أربحه بإنجاز مهام تعليمية', bin: 1 }, { label: 'يقبله بائع الحي', bin: 0 }],
        hint: 'سؤال صغير: هل يعرف بائع الحي ما هي بانكوز؟',
        wrong: 'بانكوز مثل نقود لعبة البيع والشراء في القسم: نتعلّم بها، لكنها لا تُصرف خارج اللعبة.' },
      { t: 'choose', pose: 'think', q: 'هل يمكن أن نشتري خبزًا من المخبزة بالبانكوز؟',
        opts: [{ label: 'لا، بانكوز للتدرّب داخل بنكوو', ok: 1 }, { label: 'نعم', ok: 0 }],
        hint: 'أين تعيش بانكوز؟', wrong: 'بانكوز عملة تدريبية مثل كرة التدريب، تعلّمنا اللعب، لكنها لا تُستعمل في المخبزة.' },
      { t: 'summary', pose: 'correct', points: ['الدينار الجزائري مال حقيقي.', 'بانكوز عملة تدريب افتراضية داخل بنكوو فقط.'] },
    ],
  },
  'z1-earn': {
    title: 'كيف نربح المال؟', objective: 'يربط الطفل الكسب بالعمل والجهد.', reward: 3,
    scenes: [
      { t: 'talk', pose: 'explain', img: A('ch-shopkeeper'), text: 'عمّي صاحب الدكان يعمل كل يوم: يرتّب السلع ويبيعها. بعمله يكسب المال.' },
      { t: 'choose', pose: 'think', q: 'كيف تربح بانكوز في عالم بنكوو؟',
        opts: [{ label: 'أتعلّم وأنجز مهامًا مفيدة', img: A('ic-task'), ok: 1 }, { label: 'أنتظر بلا عمل', ok: 0 }],
        hint: 'ماذا يفعل صاحب الدكان ليكسب المال؟', wrong: 'الطبيبة تعالج المرضى، والعامل يبني البيوت، فيكسبان المال. الكسب يأتي من العمل!' },
      { t: 'count', pose: 'save', q: 'راتبك الأسبوعي 10 بانكوز. عدّها معي واضغط على كل قطعة!', target: 10, have: 10, mode: 'tapall' },
      { t: 'choose', pose: 'think', minAge: 9, q: 'ربحت 3 بانكوز من درس و2 من مهمة. كم ربحت؟',
        opts: [{ label: '5', ok: 1 }, { label: '6', ok: 0 }, { label: '1', ok: 0 }],
        hint: 'اجمع: 3 + 2', wrong: 'عُدّ على أصابعك: ثلاثة… ثم أربعة، خمسة. المجموع 5.' },
      { t: 'summary', pose: 'correct', points: ['نكسب المال بالعمل والجهد.', 'في بنكوو تربح بانكوز بالتعلّم والمهام والراتب الأسبوعي.'] },
    ],
  },
  'z1-needs': {
    title: 'الحاجة أم الرغبة؟', objective: 'يصنّف الطفل الأشياء إلى حاجات ورغبات.', reward: 3,
    scenes: [
      { t: 'talk', pose: 'explain', text: 'الحاجة شيء لا نستطيع العيش أو الدراسة بدونه، مثل الخبز والماء والدفتر. الرغبة شيء جميل نريده، لكن نستطيع الانتظار.' },
      { t: 'sort', pose: 'think', q: 'ساعدني في الترتيب: حاجة أم رغبة؟', bins: ['حاجة', 'رغبة'],
        items: [{ label: 'دفتر', img: A('p-notebook'), bin: 0 }, { label: 'كرة', img: A('p-ball'), bin: 1 },
                { label: 'أقلام', img: A('p-pencils'), bin: 0 }, { label: 'سماعات', img: A('p-headphones'), bin: 1 },
                { label: 'ماء', img: A('bill-water'), bin: 0 }, { label: 'لعبة', img: A('p-game'), bin: 1 }],
        hint: 'هل تستطيع الدراسة بدون هذا الشيء؟', wrong: 'الحقيبة للمدرسة حاجة، أما حقيبة ثانية بلون آخر فرغبة. اسأل نفسك: هل أستطيع الانتظار؟' },
      { t: 'choose', pose: 'think', q: 'معك 3 بانكوز فقط وتحتاج أقلامًا للمدرسة. ماذا تشتري أولًا؟',
        opts: [{ label: 'الأقلام', img: A('p-pencils'), ok: 1 }, { label: 'الكرة', img: A('p-ball'), ok: 0 }],
        hint: 'ما الذي تحتاجه للدراسة غدًا؟', wrong: 'نبدأ بالحاجة، ثم ندّخر للرغبة. الكرة تستطيع أن تنتظر قليلًا!' },
      { t: 'summary', pose: 'correct', points: ['الحاجة نشتريها أولًا.', 'الرغبة نخطط لها وندّخر من أجلها.'] },
    ],
  },
  'z2-bag': {
    title: 'بنكوو يريد شراء حقيبة!', objective: 'يحسب الطفل الفرق بين ما يملك وثمن الهدف، ويضع هدف ادخار.', reward: 3,
    scenes: [
      { t: 'talk', pose: 'think', img: A('p-bag'), text: 'أريد شراء حقيبة ثمنها 12 بانكوز، لكن معي 4 فقط.' },
      { t: 'count', pose: 'explain', q: 'لنعدّها معًا. اضغط على القطع التي معي لنضعها في الخزنة.', target: 12, have: 4, mode: 'gap' },
      { t: 'choose', pose: 'think', q: 'هل أستطيع شراء الحقيبة الآن؟',
        opts: [{ label: 'نعم', ok: 0 }, { label: 'لا، أحتاج إلى توفير المزيد', img: A('ic-safe'), ok: 1 }],
        hint: 'قارن: 4 أم 12، أيّهما أكبر؟', wrong: 'لنعدّها معًا. معنا 4 بانكوز، والحقيبة تحتاج 12. إذن نحتاج إلى المزيد!' },
      { t: 'choose', pose: 'think', minAge: 9, q: 'كم بانكوز ينقصني لأصل إلى 12؟',
        opts: [{ label: '8', ok: 1 }, { label: '16', ok: 0 }, { label: '4', ok: 0 }],
        hint: 'ابدأ من 4 وعُدّ حتى 12.', wrong: 'من 4 إلى 12: خمسة، ستة… حتى اثني عشر. هذه 8 خطوات، إذن ينقصني 8.' },
      { t: 'choose', pose: 'think', minAge: 13, q: 'إذا ادّخرت 2 بانكوز كل أسبوع، بعد كم أسبوع أجمع الـ 8 الناقصة؟',
        opts: [{ label: '4 أسابيع', ok: 1 }, { label: 'أسبوعان', ok: 0 }, { label: '8 أسابيع', ok: 0 }],
        hint: '8 ÷ 2 = ؟', wrong: 'كل أسبوع 2: بعد أسبوع 2، بعد أسبوعين 4، بعد ثلاثة 6، بعد أربعة 8.' },
      { t: 'goal', pose: 'save', text: 'ما رأيك أن نجمع بانكوز ونوفّرها حتى نصل إلى هدفنا؟ اختر هدف ادخارك:' },
      { t: 'summary', pose: 'celebrate', points: ['قبل الشراء نقارن ما معنا بالثمن.', 'عندما لا يكفي المال، نضع هدفًا وندّخر خطوة بخطوة.'] },
    ],
  },
};

BK.mission = {
  id: 'shop-tidy', title: 'ساعد صاحب الدكان', reward: 2, objective: 'يرتّب الطفل الأسعار ويحسب مجموعًا بسيطًا.',
  items: [{ id: 'colors', label: 'ألوان', price: 5 }, { id: 'pencils', label: 'أقلام', price: 3 }, { id: 'notebook', label: 'دفتر', price: 4 }],
};

BK.products = [
  { id: 'bag', name: 'حقيبة مدرسية', price: 12, stock: 5, cat: 'school', desc: 'حقيبة متينة لكتبك ودفاترك.' },
  { id: 'notebook', name: 'دفتر', price: 4, stock: 20, cat: 'school', desc: 'دفتر 96 صفحة للتمارين.' },
  { id: 'pencils', name: 'أقلام', price: 3, stock: 20, cat: 'school', desc: 'قلمان: أزرق وأصفر.' },
  { id: 'colors', name: 'ألوان', price: 5, stock: 10, cat: 'school', desc: 'علبة ألوان مائية.' },
  { id: 'game', name: 'لعبة تعليمية', price: 10, stock: 4, cat: 'play', desc: 'لعبة حساب ممتعة.' },
  { id: 'ball', name: 'كرة قدم', price: 10, stock: 3, cat: 'play', desc: 'لفترة الاستراحة.' },
  { id: 'headphones', name: 'سماعات', price: 15, stock: 2, cat: 'play', desc: 'زينة لشخصيتك في بنكوو.' },
  { id: 'plant', name: 'نبتة للقسم', price: 7, stock: 6, cat: 'class', desc: 'مكافأة صفية — يسلّمها المعلم.', approval: true },
];

BK.fraud = {
  id: 'fake-prize-50', sender: 'جوائز بنكوو الكبرى', subject: 'مبروك!! جائزة كبيرة بانتظارك',
  // body parts: flags are tappable red flags; decoys are innocent words.
  body: [
    { t: 'مبروك! ' }, { t: 'لقد ربحت 50 بانكوز!', flag: 'جائزة من مسابقة لم تشارك فيها' }, { t: ' ' },
    { t: 'اضغط هنا', flag: 'يطلب منك الضغط على رابط غريب' }, { t: ' للحصول على جائزتك ' },
    { t: 'فورًا قبل أن تضيع!', flag: 'يستعجلك لكي لا تفكّر' },
  ],
  senderFlag: 'المرسل ليس بنك بنكوو الحقيقي',
  choices: [
    { id: 'open', label: 'أفتح الرسالة وأتبع التعليمات', safe: false },
    { id: 'check', label: 'أتحقق من الجهة المرسلة', safe: true, fb: 'أحسنت! المرسل «جوائز بنكوو الكبرى» ليس بنك بنكوو الحقيقي.' },
    { id: 'teacher', label: 'أطلب المساعدة من المعلم', safe: true, fb: 'قرار ذكي! سؤال شخص بالغ تثق به دائمًا آمن.' },
    { id: 'report', label: 'أبلغ عن رسالة مشبوهة', safe: true, fb: 'رائع! الإبلاغ يحميك ويحمي أصدقاءك.' },
  ],
};

BK.badges = [
  { id: 'explorer', title: 'مستكشف المال', rule: 'zone1' },
  { id: 'saver', title: 'بطل الادخار', rule: 'goal' },
  { id: 'shopper', title: 'متسوق ذكي', rule: 'order' },
  { id: 'bills', title: 'خبير الفواتير', rule: 'bill' },
  { id: 'guard', title: 'حارس الأمان الرقمي', rule: 'fraud' },
  { id: 'worker', title: 'مساعد مجتهد', rule: 'mission' },
];

BK.avatars = ['boy-brown', 'girl-hijab', 'boy-curly', 'girl-bow', 'girl-long', 'boy-cap', 'girl-bun', 'boy-dark'];
BK.shirts = ['#1854D6', '#F28C28', '#35B879', '#8B5CF6', '#E5484D', '#FFC83D'];
