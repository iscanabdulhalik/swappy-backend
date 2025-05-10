// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient();

async function main() {
  // Dil listesi
  const languages = [
    { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans', flagEmoji: '🇿🇦' },
    { code: 'sq', name: 'Albanian', nativeName: 'Shqip', flagEmoji: '🇦🇱' },
    { code: 'am', name: 'Amharic', nativeName: 'አማርኛ', flagEmoji: '🇪🇹' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', flagEmoji: '🇸🇦' },
    {
      code: 'hy-e',
      name: 'Armenian (Eastern)',
      nativeName: 'Հայերեն (Արևելյան)',
      flagEmoji: '🇦🇲',
    },
    {
      code: 'hy-w',
      name: 'Armenian (Western)',
      nativeName: 'Հայերեն (Արևմտյան)',
      flagEmoji: '🇦🇲',
    },
    {
      code: 'az',
      name: 'Azerbaijani (Azeri)',
      nativeName: 'Azərbaycan dili',
      flagEmoji: '🇦🇿',
    },
    { code: 'bas', name: 'Bassa', nativeName: 'Ɓasaá', flagEmoji: '🇨🇲' },
    {
      code: 'be',
      name: 'Belarusian',
      nativeName: 'Беларуская',
      flagEmoji: '🇧🇾',
    },
    { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', flagEmoji: '🇧🇩' },
    { code: 'bs', name: 'Bosnian', nativeName: 'Bosanski', flagEmoji: '🇧🇦' },
    { code: 'brl', name: 'Braille', nativeName: 'Braille', flagEmoji: '⠃⠗⠇' },
    { code: 'bg', name: 'Bulgarian', nativeName: 'Български', flagEmoji: '🇧🇬' },
    { code: 'my', name: 'Burmese', nativeName: 'မြန်မာဘာသာ', flagEmoji: '🇲🇲' },
    {
      code: 'km',
      name: 'Cambodian (Khmer)',
      nativeName: 'ភាសាខ្មែរ',
      flagEmoji: '🇰🇭',
    },
    {
      code: 'kea',
      name: 'Cape Verde Creole',
      nativeName: 'Kriolu',
      flagEmoji: '🇨🇻',
    },
    { code: 'ceb', name: 'Cebuano', nativeName: 'Cebuano', flagEmoji: '🇵🇭' },
    {
      code: 'zh-CN',
      name: 'Chinese (Simplified)',
      nativeName: '简体中文',
      flagEmoji: '🇨🇳',
    },
    {
      code: 'zh-TW',
      name: 'Chinese (Traditional)',
      nativeName: '繁體中文',
      flagEmoji: '🇹🇼',
    },
    { code: 'chk', name: 'Chuukese', nativeName: 'Chuukese', flagEmoji: '🇫🇲' },
    { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', flagEmoji: '🇭🇷' },
    { code: 'cs', name: 'Czech', nativeName: 'Čeština', flagEmoji: '🇨🇿' },
    { code: 'da', name: 'Danish', nativeName: 'Dansk', flagEmoji: '🇩🇰' },
    { code: 'prs', name: 'Dari', nativeName: 'دری', flagEmoji: '🇦🇫' },
    { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flagEmoji: '🇳🇱' },
    { code: 'en', name: 'English', nativeName: 'English', flagEmoji: '🇬🇧' },
    { code: 'et', name: 'Estonian', nativeName: 'Eesti', flagEmoji: '🇪🇪' },
    {
      code: 'fa',
      name: 'Farsi (Persian)',
      nativeName: 'فارسی',
      flagEmoji: '🇮🇷',
    },
    { code: 'fi', name: 'Finnish', nativeName: 'Suomi', flagEmoji: '🇫🇮' },
    { code: 'nl-be', name: 'Flemmish', nativeName: 'Vlaams', flagEmoji: '🇧🇪' },
    {
      code: 'fr-ca',
      name: 'French (Canada)',
      nativeName: 'Français (Canada)',
      flagEmoji: '🇨🇦',
    },
    {
      code: 'fr',
      name: 'French (France)',
      nativeName: 'Français',
      flagEmoji: '🇫🇷',
    },
    { code: 'ff', name: 'Fulani', nativeName: 'Fulfulde', flagEmoji: '🌍' },
    { code: 'ka', name: 'Georgian', nativeName: 'ქართული', flagEmoji: '🇬🇪' },
    { code: 'de', name: 'German', nativeName: 'Deutsch', flagEmoji: '🇩🇪' },
    { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', flagEmoji: '🇬🇷' },
    { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', flagEmoji: '🇮🇳' },
    {
      code: 'ht',
      name: 'Haitian Creole',
      nativeName: 'Kreyòl Ayisyen',
      flagEmoji: '🇭🇹',
    },
    {
      code: 'cnh',
      name: 'Hakha Chin',
      nativeName: 'Hakha Chin',
      flagEmoji: '🇲🇲',
    },
    {
      code: 'hak',
      name: 'Hakka (Chinese)',
      nativeName: '客家话',
      flagEmoji: '🇨🇳',
    },
    { code: 'he', name: 'Hebrew', nativeName: 'עברית', flagEmoji: '🇮🇱' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flagEmoji: '🇮🇳' },
    { code: 'hmn', name: 'Hmong', nativeName: 'Hmoob', flagEmoji: '🌏' },
    { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', flagEmoji: '🇭🇺' },
    { code: 'is', name: 'Icelandic', nativeName: 'Íslenska', flagEmoji: '🇮🇸' },
    { code: 'ig', name: 'Igbo/Ibo', nativeName: 'Igbo', flagEmoji: '🇳🇬' },
    { code: 'ilo', name: 'Ilocano', nativeName: 'Ilokano', flagEmoji: '🇵🇭' },
    {
      code: 'hil',
      name: 'Ilonggo (Hiligaynon)',
      nativeName: 'Hiligaynon',
      flagEmoji: '🇵🇭',
    },
    {
      code: 'id',
      name: 'Indonesian',
      nativeName: 'Bahasa Indonesia',
      flagEmoji: '🇮🇩',
    },
    { code: 'it', name: 'Italian', nativeName: 'Italiano', flagEmoji: '🇮🇹' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語', flagEmoji: '🇯🇵' },
    { code: 'jv', name: 'Javanese', nativeName: 'Basa Jawa', flagEmoji: '🇮🇩' },
    { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', flagEmoji: '🇮🇳' },
    { code: 'kar', name: 'Karen', nativeName: 'Karen', flagEmoji: '🇲🇲' },
    { code: 'kk', name: 'Kazakh', nativeName: 'Қазақ тілі', flagEmoji: '🇰🇿' },
    {
      code: 'rw',
      name: 'Kinyarwanda',
      nativeName: 'Kinyarwanda',
      flagEmoji: '🇷🇼',
    },
    { code: 'rn', name: 'Kirundi', nativeName: 'Kirundi', flagEmoji: '🇧🇮' },
    { code: 'ko', name: 'Korean', nativeName: '한국어', flagEmoji: '🇰🇷' },
    {
      code: 'kmr',
      name: 'Kurdish (Kurmanji dialect)',
      nativeName: 'Kurmancî',
      flagEmoji: '🇹🇯',
    },
    {
      code: 'ckb',
      name: 'Kurdish (Sorani dialect)',
      nativeName: 'سۆرانی',
      flagEmoji: '🇹🇯',
    },
    {
      code: 'ky',
      name: 'Kyrgyz/Kirgiz',
      nativeName: 'Кыргызча',
      flagEmoji: '🇰🇬',
    },
    { code: 'lo', name: 'Lao (Laotian)', nativeName: 'ລາວ', flagEmoji: '🇱🇦' },
    { code: 'lv', name: 'Latvian', nativeName: 'Latviešu', flagEmoji: '🇱🇻' },
    { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių', flagEmoji: '🇱🇹' },
    {
      code: 'mk',
      name: 'Macedonian',
      nativeName: 'Македонски',
      flagEmoji: '🇲🇰',
    },
    {
      code: 'ms',
      name: 'Malay (Malaysian)',
      nativeName: 'Bahasa Melayu',
      flagEmoji: '🇲🇾',
    },
    { code: 'mnk', name: 'Mandinka', nativeName: 'Mandinka', flagEmoji: '🇬🇲' },
    { code: 'mr', name: 'Marathi', nativeName: 'मराठी', flagEmoji: '🇮🇳' },
    {
      code: 'mh',
      name: 'Marshallese',
      nativeName: 'Kajin M̧ajeļ',
      flagEmoji: '🇲🇭',
    },
    { code: 'mien', name: 'Mien', nativeName: 'Mien', flagEmoji: '🌏' },
    { code: 'mn', name: 'Mongolian', nativeName: 'Монгол', flagEmoji: '🇲🇳' },
    {
      code: 'cnr',
      name: 'Montenegrin',
      nativeName: 'Crnogorski',
      flagEmoji: '🇲🇪',
    },
    { code: 'nv', name: 'Navajo', nativeName: 'Diné bizaad', flagEmoji: '🇺🇸' },
    { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', flagEmoji: '🇳🇵' },
    { code: 'no', name: 'Norwegian', nativeName: 'Norsk', flagEmoji: '🇳🇴' },
    { code: 'om', name: 'Oromo', nativeName: 'Afaan Oromoo', flagEmoji: '🇪🇹' },
    { code: 'ps', name: 'Pashto', nativeName: 'پښتو', flagEmoji: '🇦🇫' },
    { code: 'pl', name: 'Polish', nativeName: 'Polski', flagEmoji: '🇵🇱' },
    {
      code: 'pt-br',
      name: 'Portuguese (Brazil)',
      nativeName: 'Português (Brasil)',
      flagEmoji: '🇧🇷',
    },
    {
      code: 'pt',
      name: 'Portuguese (Portugal)',
      nativeName: 'Português',
      flagEmoji: '🇵🇹',
    },
    { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', flagEmoji: '🇮🇳' },
    { code: 'rhg', name: 'Rohingya', nativeName: 'Rohingya', flagEmoji: '🇲🇲' },
    {
      code: 'ro',
      name: 'Romanian (Moldavan)',
      nativeName: 'Română',
      flagEmoji: '🇷🇴',
    },
    { code: 'ru', name: 'Russian', nativeName: 'Русский', flagEmoji: '🇷🇺' },
    { code: 'sr', name: 'Serbian', nativeName: 'Српски', flagEmoji: '🇷🇸' },
    { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', flagEmoji: '🇸🇰' },
    {
      code: 'sl',
      name: 'Slovenian',
      nativeName: 'Slovenščina',
      flagEmoji: '🇸🇮',
    },
    { code: 'so', name: 'Somali', nativeName: 'Soomaali', flagEmoji: '🇸🇴' },
    {
      code: 'es',
      name: 'Spanish (Castilian)',
      nativeName: 'Español (Castellano)',
      flagEmoji: '🇪🇸',
    },
    {
      code: 'es-419',
      name: 'Spanish (Latin American)',
      nativeName: 'Español (Latinoamérica)',
      flagEmoji: '🌎',
    },
    {
      code: 'es-other',
      name: 'Spanish (other varieties)',
      nativeName: 'Español (otras variedades)',
      flagEmoji: '🌎',
    },
    { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', flagEmoji: '🇹🇿' },
    { code: 'sv', name: 'Swedish', nativeName: 'Svenska', flagEmoji: '🇸🇪' },
    { code: 'tl', name: 'Tagalog', nativeName: 'Tagalog', flagEmoji: '🇵🇭' },
    { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', flagEmoji: '🇮🇳' },
    { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', flagEmoji: '🇮🇳' },
    { code: 'th', name: 'Thai', nativeName: 'ไทย', flagEmoji: '🇹🇭' },
    { code: 'bo', name: 'Tibetan', nativeName: 'བོད་སྐད་', flagEmoji: '🏳️' },
    { code: 'ti', name: 'Tigrinya', nativeName: 'ትግርኛ', flagEmoji: '🇪🇷' },
    { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flagEmoji: '🇹🇷' },
    {
      code: 'uk',
      name: 'Ukrainian',
      nativeName: 'Українська',
      flagEmoji: '🇺🇦',
    },
    { code: 'ur', name: 'Urdu', nativeName: 'اردو', flagEmoji: '🇵🇰' },
    { code: 'uz', name: 'Uzbek', nativeName: 'Ozbek', flagEmoji: '🇺🇿' },
    {
      code: 'vi',
      name: 'Vietnamese',
      nativeName: 'Tiếng Việt',
      flagEmoji: '🇻🇳',
    },
    { code: 'wo', name: 'Wolof', nativeName: 'Wolof', flagEmoji: '🇸🇳' },
    { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá', flagEmoji: '🇳🇬' },
  ];

  console.log(`Eklenecek dil sayısı: ${languages.length}`);

  // Batch işlemi olarak dilleri ekle
  const createdLanguages = await Promise.all(
    languages.map(async (language) => {
      return prisma.language.upsert({
        where: { code: language.code },
        update: language,
        create: language,
      });
    }),
  );

  console.log(`${createdLanguages.length} dil başarıyla eklendi.`);

  // Test kullanıcısı (isteğe bağlı)
}

main()
  .catch((e) => {
    console.error('Hata:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
