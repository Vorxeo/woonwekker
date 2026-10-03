'use strict';
/* Pages /contrato/ and /chegada/. Quotes come only from WWContract. */
(function () {
  const OFFICIAL = {
    digid: 'https://www.digid.nl/aanvragen-en-activeren/digid-aanvragen',
    digidEn: 'https://www.digid.nl/en/apply-and-activate/apply-digid',
    brp: 'https://www.rijksoverheid.nl/vraag-en-antwoord/immigratie-naar-nederland/wat-moet-ik-regelen-als-ik-in-nederland-kom-wonen',
    bsn: 'https://www.rijksoverheid.nl/vraag-en-antwoord/privacy-en-persoonsgegevens/hoe-kom-ik-aan-een-burgerservicenummer-bsn',
    insurance: 'https://www.rijksoverheid.nl/vraag-en-antwoord/zorgverzekering/ben-ik-verplicht-een-zorgverzekering-af-te-sluiten',
    insuranceWork: 'https://www.rijksoverheid.nl/vraag-en-antwoord/immigratie-naar-nederland/moet-ik-een-zorgverzekering-afsluiten-als-ik-in-nederland-ga-werken',
  };

  const COPY = {
    nl: {
      footC: 'Contract', footA: 'Aankomst',
      cEyebrow: 'Contract', cTitle: 'Vijf punten uit het PDF',
      cIntro: 'Upload het huurcontract. Je ziet alleen zinnen die in het PDF staan. Ontbreekt een punt, dan staat het niet in de tekst die we konden lezen.',
      cFile: 'PDF-bestand', cPrice: 'Huurprijs in het aanbod (optioneel)', cCity: 'Plaats in het aanbod (optioneel)', cAddress: 'Adres in het aanbod (optioneel)',
      cRead: 'Lees het PDF', cReading: 'Bezig…',
      cBad: 'Dit PDF kon niet gelezen worden. Er is niets ingevuld.',
      cNotPdf: 'Dit is geen PDF. Er is niets ingevuld.',
      cOnly: 'Alleen de citaten hieronder komen uit het PDF. Er is geen andere conclusie.',
      term: 'Termijn', deposit: 'Borg', included: 'Wat in de prijs zit', index: 'Indexering', listing: 'Verschil met het aanbod',
      absent: 'Niet aangetroffen in de tekst van dit PDF.',
      noListing: 'Geen aanbod meegegeven, dus niets vergeleken.',
      noConflict: 'Geen tegenstrijdig feit gevonden in de tekst van dit PDF.',
      unchecked: 'Niet vergeleken, omdat het niet als zodanig in het PDF stond:',
      conflict: 'Dit staat in het PDF en wijkt af van wat je invulde.',
      aEyebrow: 'Aankomst', aTitle: 'DigiD, gemeente, BSN, zorgverzekering',
      aIntro: 'Checklist op hetzelfde Woonwekker-account. Wij vullen geen formulier in en geven geen advies over een visum of verblijfsvergunning.',
      aSaveOn: 'De vinkjes blijven op dit account in deze browser. Ze gaan niet naar een server.',
      aSaveOff: 'Log in om de vinkjes op dit account te bewaren. De links hieronder werken ook zonder account.',
      aLogin: 'Inloggen',
      digidT: 'DigiD aanvragen',
      digidB: 'Op de officiële pagina: burgerservicenummer (BSN), een inschrijfadres bij een Nederlandse gemeente, en een mobiele telefoon. De brief gaat naar dat adres. Wij vragen DigiD niet voor je aan.',
      brpT: 'Inschrijven bij de gemeente',
      brpB: 'De Rijksoverheid: schrijf je in bij de gemeente waar je gaat wonen als je langer dan 4 maanden in Nederland komt wonen, uiterlijk 5 dagen na aankomst, op afspraak. Houd het adres waar je gaat wonen bij de hand. Welke documenten de gemeente vraagt, staat bij die gemeente, niet hier.',
      bsnT: 'Burgerservicenummer (BSN)',
      bsnB: 'Je krijgt een BSN bij inschrijving in de Basisregistratie Personen (BRP). Het nummer staat op paspoort, rijbewijs en identiteitskaart als het daarop vermeld is. Wij zoeken het nummer niet op.',
      insT: 'Zorgverzekering',
      insB: 'Een basisverzekering is verplicht als je in Nederland woont of werkt. Een aanvullende verzekering is dat niet. Werk je in Nederland, dan noemt de Rijksoverheid een termijn van 4 maanden om de basisverzekering af te sluiten. Wij sluiten hem niet voor je af.',
      official: 'Officiële pagina',
    },
    en: {
      footC: 'Contract', footA: 'Arrival',
      cEyebrow: 'Contract', cTitle: 'Five points from the PDF',
      cIntro: 'Upload the rental contract. You only see sentences that are in the PDF. If a point is missing, it was not in the text we could read.',
      cFile: 'PDF file', cPrice: 'Rent in the listing (optional)', cCity: 'City in the listing (optional)', cAddress: 'Address in the listing (optional)',
      cRead: 'Read the PDF', cReading: 'Reading…',
      cBad: 'This PDF could not be read. Nothing was filled in.',
      cNotPdf: 'This is not a PDF. Nothing was filled in.',
      cOnly: 'Only the quotations below come from the PDF. There is no other conclusion.',
      term: 'Term', deposit: 'Deposit', included: 'What is included in the price', index: 'Indexation', listing: 'What does not match the listing',
      absent: 'Not found in the text of this PDF.',
      noListing: 'No listing was attached, so nothing was compared.',
      noConflict: 'No conflicting fact was found in the text of this PDF.',
      unchecked: 'Not compared, because it was not written that way in the PDF:',
      conflict: 'This is written in the PDF and differs from what you entered.',
      aEyebrow: 'Arrival', aTitle: 'DigiD, municipality, BSN, health insurance',
      aIntro: 'Checklist on the same Woonwekker account. We do not fill in any form and we do not give visa or residence-permit advice.',
      aSaveOn: 'Ticks stay on this account in this browser. They are not sent to a server.',
      aSaveOff: 'Sign in to keep the ticks on this account. The links below work without an account.',
      aLogin: 'Sign in',
      digidT: 'Apply for DigiD',
      digidB: 'On the official page: a citizen service number (BSN), an address registered with a Dutch municipality, and a mobile phone. The letter goes to that address. We do not apply for DigiD for you.',
      brpT: 'Register with the municipality',
      brpB: 'The national government: register at the municipality where you will live if you will stay in the Netherlands for more than 4 months, within 5 days of arrival, by appointment. Have the address where you will live with you. Which documents that municipality asks for is on their own page, not here.',
      bsnT: 'Citizen service number (BSN)',
      bsnB: 'You receive a BSN when you are registered in the Personal Records Database (BRP). The number is on a passport, driving licence and identity card when those documents show it. We do not look the number up.',
      insT: 'Health insurance',
      insB: 'A basic policy is compulsory if you live or work in the Netherlands. A supplementary policy is not. If you work in the Netherlands, the national government names a period of 4 months to take out the basic policy. We do not take it out for you.',
      official: 'Official page',
    },
    es: {
      footC: 'Contrato', footA: 'Llegada',
      cEyebrow: 'Contrato', cTitle: 'Cinco puntos del PDF',
      cIntro: 'Sube el contrato de alquiler. Solo ves frases que están en el PDF. Si falta un punto, no estaba en el texto que pudimos leer.',
      cFile: 'Archivo PDF', cPrice: 'Alquiler del anuncio (opcional)', cCity: 'Ciudad del anuncio (opcional)', cAddress: 'Dirección del anuncio (opcional)',
      cRead: 'Leer el PDF', cReading: 'Leyendo…',
      cBad: 'No se pudo leer este PDF. No se ha rellenado nada.',
      cNotPdf: 'Esto no es un PDF. No se ha rellenado nada.',
      cOnly: 'Solo las citas de abajo salen del PDF. No hay otra conclusión.',
      term: 'Plazo', deposit: 'Fianza', included: 'Qué incluye el precio', index: 'Indexación', listing: 'Qué no coincide con el anuncio',
      absent: 'No aparece en el texto de este PDF.',
      noListing: 'No se adjuntó un anuncio, así que no se comparó nada.',
      noConflict: 'No hay un hecho en el texto de este PDF que contradiga lo que escribiste.',
      unchecked: 'No comparado, porque no estaba escrito así en el PDF:',
      conflict: 'Esto está escrito en el PDF y difiere de lo que indicaste.',
      aEyebrow: 'Llegada', aTitle: 'DigiD, municipio, BSN, seguro de salud',
      aIntro: 'Lista en la misma cuenta de Woonwekker. No rellenamos ningún formulario ni damos consejo sobre visado o permiso de residencia.',
      aSaveOn: 'Las marcas se quedan en esta cuenta, en este navegador. No se envían a un servidor.',
      aSaveOff: 'Entra para guardar las marcas en esta cuenta. Los enlaces funcionan sin cuenta.',
      aLogin: 'Entrar',
      digidT: 'Solicitar DigiD',
      digidB: 'En la página oficial: número de servicio al ciudadano (BSN), una dirección inscrita en un municipio neerlandés y un teléfono móvil. La carta va a esa dirección. No solicitamos el DigiD por ti.',
      brpT: 'Inscribirse en el municipio',
      brpB: 'El Gobierno: inscríbete en el municipio donde vas a vivir si vas a estar más de 4 meses en los Países Bajos, como máximo 5 días después de llegar, con cita. Lleva la dirección donde vas a vivir. Qué documentos pide ese municipio está en su página, no aquí.',
      bsnT: 'Número de servicio al ciudadano (BSN)',
      bsnB: 'Recibes un BSN al inscribirte en el registro de personas (BRP). El número figura en el pasaporte, el permiso de conducir y el documento de identidad cuando esos documentos lo muestran. No lo buscamos nosotros.',
      insT: 'Seguro de salud',
      insB: 'El seguro básico es obligatorio si vives o trabajas en los Países Bajos. El complementario no lo es. Si trabajas en los Países Bajos, el Gobierno indica un plazo de 4 meses para contratar el seguro básico. No lo contratamos por ti.',
      official: 'Página oficial',
    },
    pl: {
      footC: 'Umowa', footA: 'Przyjazd',
      cEyebrow: 'Umowa', cTitle: 'Pięć punktów z PDF',
      cIntro: 'Wgraj umowę najmu. Widzisz tylko zdania, które są w PDF. Jeśli punktu nie ma, nie było go w tekście, który dało się odczytać.',
      cFile: 'Plik PDF', cPrice: 'Czynsz z ogłoszenia (opcjonalnie)', cCity: 'Miejscowość z ogłoszenia (opcjonalnie)', cAddress: 'Adres z ogłoszenia (opcjonalnie)',
      cRead: 'Odczytaj PDF', cReading: 'Odczyt…',
      cBad: 'Tego PDF nie dało się odczytać. Nic nie zostało uzupełnione.',
      cNotPdf: 'To nie jest PDF. Nic nie zostało uzupełnione.',
      cOnly: 'Tylko cytaty poniżej pochodzą z PDF. Nie ma innego wniosku.',
      term: 'Okres', deposit: 'Kaucja', included: 'Co wchodzi w cenę', index: 'Indeksacja', listing: 'Co nie zgadza się z ogłoszeniem',
      absent: 'Nie ma tego w tekście tego PDF.',
      noListing: 'Nie podano ogłoszenia, więc nic nie porównano.',
      noConflict: 'W tekście tego PDF nie ma faktu sprzecznego z tym, co wpisano.',
      unchecked: 'Nie porównano, bo nie było tak zapisane w PDF:',
      conflict: 'To jest w PDF i różni się od tego, co wpisano.',
      aEyebrow: 'Przyjazd', aTitle: 'DigiD, gmina, BSN, ubezpieczenie zdrowotne',
      aIntro: 'Lista na tym samym koncie Woonwekker. Nie wypełniamy formularzy i nie doradzamy w sprawie wizy ani zezwolenia na pobyt.',
      aSaveOn: 'Ptaszki zostają na tym koncie w tej przeglądarce. Nie idą na serwer.',
      aSaveOff: 'Zaloguj się, żeby zachować ptaszki na tym koncie. Linki działają bez konta.',
      aLogin: 'Zaloguj się',
      digidT: 'Wniosek o DigiD',
      digidB: 'Na oficjalnej stronie: numer BSN, adres zameldowania w holenderskiej gminie i telefon komórkowy. List idzie na ten adres. Nie składamy wniosku za ciebie.',
      brpT: 'Meldunek w gminie',
      brpB: 'Rząd: zamelduj się w gminie, w której będziesz mieszkać, jeśli zostajesz w Holandii dłużej niż 4 miesiące, najpóźniej 5 dni po przyjeździe, po umówieniu wizyty. Miej przy sobie adres, pod którym będziesz mieszkać. Jakich dokumentów chce ta gmina, jest na jej stronie, nie tutaj.',
      bsnT: 'Numer BSN',
      bsnB: 'BSN dostajesz przy wpisie do rejestru osób (BRP). Numer jest na paszporcie, prawie jazdy i dowodzie, jeśli te dokumenty go pokazują. Nie wyszukujemy go.',
      insT: 'Ubezpieczenie zdrowotne',
      insB: 'Podstawowe ubezpieczenie jest obowiązkowe, jeśli mieszkasz lub pracujesz w Holandii. Dodatkowe nie jest. Jeśli pracujesz w Holandii, rząd podaje 4 miesiące na zawarcie podstawowego ubezpieczenia. Nie zawieramy go za ciebie.',
      official: 'Oficjalna strona',
    },
    pt: {
      footC: 'Contrato', footA: 'Chegada',
      cEyebrow: 'Contrato', cTitle: 'Cinco pontos do PDF',
      cIntro: 'Carregue o contrato de arrendamento. Só vê frases que estão no PDF. Se um ponto falta, não estava no texto que foi possível ler.',
      cFile: 'Ficheiro PDF', cPrice: 'Renda do anúncio (opcional)', cCity: 'Localidade do anúncio (opcional)', cAddress: 'Morada do anúncio (opcional)',
      cRead: 'Ler o PDF', cReading: 'A ler…',
      cBad: 'Não foi possível ler este PDF. Nada foi preenchido.',
      cNotPdf: 'Isto não é um PDF. Nada foi preenchido.',
      cOnly: 'Só as citações abaixo vêm do PDF. Não há outra conclusão.',
      term: 'Prazo', deposit: 'Caução', included: 'O que está incluído no preço', index: 'Indexação', listing: 'O que não coincide com o anúncio',
      absent: 'Não está no texto deste PDF.',
      noListing: 'Não foi indicado um anúncio, por isso nada foi comparado.',
      noConflict: 'Não há no texto deste PDF um facto que contradiga o que escreveu.',
      unchecked: 'Não comparado, porque não estava escrito assim no PDF:',
      conflict: 'Isto está escrito no PDF e difere do que indicou.',
      aEyebrow: 'Chegada', aTitle: 'DigiD, município, BSN, seguro de saúde',
      aIntro: 'Lista na mesma conta Woonwekker. Não preenchemos formulários nem damos conselhos sobre visto ou autorização de residência.',
      aSaveOn: 'As marcas ficam nesta conta, neste navegador. Não são enviadas para um servidor.',
      aSaveOff: 'Entre para guardar as marcas nesta conta. As ligações funcionam sem conta.',
      aLogin: 'Entrar',
      digidT: 'Pedir o DigiD',
      digidB: 'Na página oficial: número de cidadão (BSN), uma morada registada num município neerlandês e um telemóvel. A carta vai para essa morada. Não pedimos o DigiD por si.',
      brpT: 'Registo no município',
      brpB: 'O Governo: registe-se no município onde vai viver se ficar mais de 4 meses nos Países Baixos, no máximo 5 dias após a chegada, com marcação. Tenha consigo a morada onde vai viver. Os documentos que esse município pede estão na página dele, não aqui.',
      bsnT: 'Número de cidadão (BSN)',
      bsnB: 'Recebe um BSN ao registar-se na base de pessoas (BRP). O número consta do passaporte, da carta de condução e do cartão de cidadão quando esses documentos o mostram. Não o procuramos.',
      insT: 'Seguro de saúde',
      insB: 'O seguro de base é obrigatório se vive ou trabalha nos Países Baixos. O complementar não é. Se trabalha nos Países Baixos, o Governo indica 4 meses para celebrar o seguro de base. Não o celebramos por si.',
      official: 'Página oficial',
    },
    ro: {
      footC: 'Contract', footA: 'Sosire',
      cEyebrow: 'Contract', cTitle: 'Cinci puncte din PDF',
      cIntro: 'Încarcă contractul de închiriere. Vezi doar propoziții care sunt în PDF. Dacă un punct lipsește, nu era în textul care a putut fi citit.',
      cFile: 'Fișier PDF', cPrice: 'Chiria din anunț (opțional)', cCity: 'Localitatea din anunț (opțional)', cAddress: 'Adresa din anunț (opțional)',
      cRead: 'Citește PDF-ul', cReading: 'Se citește…',
      cBad: 'Acest PDF nu a putut fi citit. Nu s-a completat nimic.',
      cNotPdf: 'Acesta nu este un PDF. Nu s-a completat nimic.',
      cOnly: 'Doar citatele de mai jos vin din PDF. Nu există altă concluzie.',
      term: 'Durată', deposit: 'Garanție', included: 'Ce este inclus în preț', index: 'Indexare', listing: 'Ce nu corespunde anunțului',
      absent: 'Nu este în textul acestui PDF.',
      noListing: 'Nu a fost atașat un anunț, deci nu s-a comparat nimic.',
      noConflict: 'În textul acestui PDF nu este un fapt care să contrazică ce ai scris.',
      unchecked: 'Necomparat, pentru că nu era scris așa în PDF:',
      conflict: 'Asta este scris în PDF și diferă de ce ai introdus.',
      aEyebrow: 'Sosire', aTitle: 'DigiD, primărie, BSN, asigurare de sănătate',
      aIntro: 'Listă pe același cont Woonwekker. Nu completăm formulare și nu dăm sfaturi despre viză sau permis de ședere.',
      aSaveOn: 'Bifele rămân pe acest cont, în acest browser. Nu sunt trimise la un server.',
      aSaveOff: 'Intră în cont ca să păstrezi bifele. Linkurile merg și fără cont.',
      aLogin: 'Intră',
      digidT: 'Cerere DigiD',
      digidB: 'Pe pagina oficială: numărul BSN, o adresă înregistrată la o primărie din Țările de Jos și un telefon mobil. Scrisoarea merge la acea adresă. Nu depunem cererea pentru tine.',
      brpT: 'Înregistrare la primărie',
      brpB: 'Guvernul: înregistrează-te la primăria unde vei locui dacă stai mai mult de 4 luni în Țările de Jos, în cel mult 5 zile de la sosire, cu programare. Ai la tine adresa unde vei locui. Ce documente cere primăria este pe pagina ei, nu aici.',
      bsnT: 'Numărul BSN',
      bsnB: 'Primești un BSN la înregistrarea în registrul de persoane (BRP). Numărul este pe pașaport, permis de conducere și carte de identitate când documentele îl arată. Nu îl căutăm noi.',
      insT: 'Asigurare de sănătate',
      insB: 'Asigurarea de bază este obligatorie dacă locuiești sau lucrezi în Țările de Jos. Cea suplimentară nu este. Dacă lucrezi în Țările de Jos, guvernul indică 4 luni pentru asigurarea de bază. Nu o încheiem pentru tine.',
      official: 'Pagina oficială',
    },
    bg: {
      footC: 'Договор', footA: 'Пристигане',
      cEyebrow: 'Договор', cTitle: 'Пет точки от PDF',
      cIntro: 'Качете договора за наем. Виждате само изречения, които са в PDF. Ако точка липсва, не е била в текста, който можахме да прочетем.',
      cFile: 'PDF файл', cPrice: 'Наем от обявата (по избор)', cCity: 'Град от обявата (по избор)', cAddress: 'Адрес от обявата (по избор)',
      cRead: 'Прочети PDF', cReading: 'Четене…',
      cBad: 'Този PDF не можа да бъде прочетен. Нищо не е попълнено.',
      cNotPdf: 'Това не е PDF. Нищо не е попълнено.',
      cOnly: 'Само цитатите по-долу са от PDF. Няма друго заключение.',
      term: 'Срок', deposit: 'Депозит', included: 'Какво влиза в цената', index: 'Индексация', listing: 'Какво не съвпада с обявата',
      absent: 'Не е в текста на този PDF.',
      noListing: 'Няма приложена обява, затова нищо не е сравнено.',
      noConflict: 'В текста на този PDF няма факт, който да противоречи на въведеното.',
      unchecked: 'Не е сравнено, защото не беше записано така в PDF:',
      conflict: 'Това е записано в PDF и се различава от въведеното.',
      aEyebrow: 'Пристигане', aTitle: 'DigiD, общината, BSN, здравна осигуровка',
      aIntro: 'Списък в същия акаунт на Woonwekker. Не попълваме формуляри и не даваме съвет за виза или разрешение за пребиваване.',
      aSaveOn: 'Отметките остават в този акаунт, в този браузър. Не се изпращат към сървър.',
      aSaveOff: 'Влезте, за да запазите отметките в този акаунт. Връзките работят и без акаунт.',
      aLogin: 'Вход',
      digidT: 'Заявка за DigiD',
      digidB: 'На официалната страница: номер BSN, адрес на регистрация в нидерландска община и мобилен телефон. Писмото отива на този адрес. Не подаваме заявката вместо вас.',
      brpT: 'Регистрация в общината',
      brpB: 'Правителството: регистрирайте се в общината, където ще живеете, ако оставате повече от 4 месеца в Нидерландия, най-късно 5 дни след пристигане, с час. Носете адреса, на който ще живеете. Кои документи иска общината е на нейната страница, не тук.',
      bsnT: 'Номер BSN',
      bsnB: 'Получавате BSN при вписване в регистъра на лицата (BRP). Номерът е в паспорта, шофьорската книжка и личната карта, когато документите го показват. Ние не го търсим.',
      insT: 'Здравна осигуровка',
      insB: 'Основната полица е задължителна, ако живеете или работите в Нидерландия. Допълнителната не е. Ако работите в Нидерландия, правителството посочва 4 месеца за основната полица. Ние не я сключваме вместо вас.',
      official: 'Официална страница',
    },
    it: {
      footC: 'Contratto', footA: 'Arrivo',
      cEyebrow: 'Contratto', cTitle: 'Cinque punti dal PDF',
      cIntro: 'Carica il contratto di affitto. Vedi solo frasi che sono nel PDF. Se un punto manca, non era nel testo che si è potuto leggere.',
      cFile: 'File PDF', cPrice: 'Canone dell’annuncio (facoltativo)', cCity: 'Città dell’annuncio (facoltativo)', cAddress: 'Indirizzo dell’annuncio (facoltativo)',
      cRead: 'Leggi il PDF', cReading: 'Lettura…',
      cBad: 'Questo PDF non si è potuto leggere. Non è stato compilato nulla.',
      cNotPdf: 'Questo non è un PDF. Non è stato compilato nulla.',
      cOnly: 'Solo le citazioni qui sotto vengono dal PDF. Non c’è un’altra conclusione.',
      term: 'Durata', deposit: 'Deposito', included: 'Cosa è incluso nel prezzo', index: 'Indicizzazione', listing: 'Cosa non coincide con l’annuncio',
      absent: 'Non è nel testo di questo PDF.',
      noListing: 'Nessun annuncio è stato indicato, quindi non è stato confrontato nulla.',
      noConflict: 'Nel testo di questo PDF non c’è un fatto che contraddica ciò che hai scritto.',
      unchecked: 'Non confrontato, perché non era scritto così nel PDF:',
      conflict: 'Questo è scritto nel PDF e differisce da ciò che hai inserito.',
      aEyebrow: 'Arrivo', aTitle: 'DigiD, comune, BSN, assicurazione sanitaria',
      aIntro: 'Elenco sullo stesso account Woonwekker. Non compiliamo moduli e non diamo consigli su visto o permesso di soggiorno.',
      aSaveOn: 'Le spunte restano su questo account, in questo browser. Non vanno a un server.',
      aSaveOff: 'Accedi per tenere le spunte su questo account. I link funzionano anche senza account.',
      aLogin: 'Accedi',
      digidT: 'Richiedere il DigiD',
      digidB: 'Sulla pagina ufficiale: numero BSN, un indirizzo registrato presso un comune olandese e un telefono cellulare. La lettera va a quell’indirizzo. Non presentiamo la domanda al posto tuo.',
      brpT: 'Iscrizione al comune',
      brpB: 'Il governo: iscriviti al comune dove vivrai se resti più di 4 mesi nei Paesi Bassi, entro 5 giorni dall’arrivo, su appuntamento. Tieni con te l’indirizzo dove vivrai. Quali documenti chiede quel comune è sulla sua pagina, non qui.',
      bsnT: 'Numero BSN',
      bsnB: 'Ricevi un BSN con l’iscrizione nell’anagrafe (BRP). Il numero è su passaporto, patente e carta d’identità quando quei documenti lo riportano. Non lo cerchiamo noi.',
      insT: 'Assicurazione sanitaria',
      insB: 'La polizza di base è obbligatoria se vivi o lavori nei Paesi Bassi. Quella integrativa no. Se lavori nei Paesi Bassi, il governo indica 4 mesi per stipulare la polizza di base. Non la stipuliamo noi.',
      official: 'Pagina ufficiale',
    },
  };

  function L() {
    const code = (typeof lang === 'string' && COPY[lang]) ? lang : 'nl';
    return COPY[code];
  }
  function e(v) {
    if (typeof esc === 'function') return esc(v);
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function setFoot() {
    const t = L();
    const c = document.querySelector('#foot-contrato');
    const a = document.querySelector('#foot-chegada');
    if (c) c.textContent = t.footC;
    if (a) a.textContent = t.footA;
  }
  function quoteBlock(p, label, absent) {
    if (!p || p.status !== 'quoted' || !p.quotes.length) {
      return `<article class="point"><h2>${e(label)}</h2><p class="absent">${e(absent)}</p></article>`;
    }
    return `<article class="point"><h2>${e(label)}</h2>${p.quotes.map((q) => `<blockquote>${e(q)}</blockquote>`).join('')}</article>`;
  }
  function listingBlock(listing, t) {
    if (!listing || listing.status === 'no_listing') {
      return `<article class="point"><h2>${e(t.listing)}</h2><p class="absent">${e(t.noListing)}</p></article>`;
    }
    const conflicts = (listing.conflicts || []).map((c) => `<blockquote>${e(c.quote)}</blockquote><p class="absent">${e(t.conflict)} ${e(c.field)}: ${e(c.listing)}</p>`).join('');
    const unchecked = (listing.unchecked || []).length ? `<p class="absent">${e(t.unchecked)} ${e(listing.unchecked.join(', '))}</p>` : '';
    const none = listing.status === 'no_conflict' && !(listing.conflicts || []).length ? `<p class="absent">${e(t.noConflict)}</p>` : '';
    return `<article class="point"><h2>${e(t.listing)}</h2>${conflicts}${none}${unchecked}</article>`;
  }

  function loggedIn() {
    try {
      return typeof isLoggedIn === 'function' && typeof loadAccount === 'function' && isLoggedIn(loadAccount());
    } catch {
      return false;
    }
  }
  function chegadaState() {
    const empty = { digid: false, brp: false, bsn: false, insurance: false };
    if (!loggedIn()) return empty;
    try {
      const a = loadAccount();
      const c = a && a.chegada;
      if (!c) return empty;
      return {
        digid: c.digid === true,
        brp: c.brp === true,
        bsn: c.bsn === true,
        insurance: c.insurance === true,
      };
    } catch {
      return empty;
    }
  }
  function persist(state) {
    if (!loggedIn() || typeof saveAccount !== 'function' || typeof loadAccount !== 'function') return false;
    const a = loadAccount();
    a.chegada = {
      digid: state.digid === true,
      brp: state.brp === true,
      bsn: state.bsn === true,
      insurance: state.insurance === true,
    };
    saveAccount(a);
    const back = loadAccount();
    return back.chegada.digid === a.chegada.digid && back.chegada.brp === a.chegada.brp && back.chegada.bsn === a.chegada.bsn && back.chegada.insurance === a.chegada.insurance;
  }

  window.wwRenderContrato = function () {
    const t = L();
    setFoot();
    document.title = 'Woonwekker — ' + t.cTitle;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = t.cIntro;
    main.innerHTML = `<div class="page-head ww-contract"><div class="eyebrow">${e(t.cEyebrow)}</div><h1>${e(t.cTitle)}</h1><p>${e(t.cIntro)}</p></div>
      <form class="ww-contract" id="contrato-form">
        <div class="field"><label for="contrato-file">${e(t.cFile)}</label><input id="contrato-file" name="file" type="file" accept="application/pdf,.pdf" required></div>
        <div class="listing">
          <div class="field"><label for="contrato-price">${e(t.cPrice)}</label><input id="contrato-price" name="price" inputmode="decimal" autocomplete="off"></div>
          <div class="field"><label for="contrato-city">${e(t.cCity)}</label><input id="contrato-city" name="city" autocomplete="off"></div>
          <div class="field"><label for="contrato-address">${e(t.cAddress)}</label><input id="contrato-address" name="address" autocomplete="off"></div>
        </div>
        <button class="primary" type="submit">${e(t.cRead)}</button>
      </form>
      <div id="contrato-out" class="ww-contract points" aria-live="polite"></div>`;
    const form = document.querySelector('#contrato-form');
    const out = document.querySelector('#contrato-out');
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const file = document.querySelector('#contrato-file').files[0];
      out.innerHTML = `<p class="warn">${e(L().cReading)}</p>`;
      if (!file) {
        out.innerHTML = `<p class="warn">${e(L().cBad)}</p>`;
        return;
      }
      let buf;
      try { buf = new Uint8Array(await file.arrayBuffer()); } catch {
        out.innerHTML = `<p class="warn">${e(L().cBad)}</p>`;
        return;
      }
      const listing = {
        price: document.querySelector('#contrato-price').value,
        city: document.querySelector('#contrato-city').value,
        address: document.querySelector('#contrato-address').value,
      };
      let result;
      try { result = await WWContract.readContract(buf, listing); } catch {
        result = { readable: false, reason: 'unreadable', points: null };
      }
      const now = L();
      if (!result || !result.readable || !result.points) {
        out.innerHTML = `<p class="warn">${e(result && result.reason === 'not_pdf' ? now.cNotPdf : now.cBad)}</p>`;
        return;
      }
      const p = result.points;
      out.innerHTML = `<p class="warn">${e(now.cOnly)}</p>` +
        quoteBlock(p.term, now.term, now.absent) +
        quoteBlock(p.deposit, now.deposit, now.absent) +
        quoteBlock(p.included, now.included, now.absent) +
        quoteBlock(p.indexation, now.index, now.absent) +
        listingBlock(p.listing, now);
    };
  };

  function item(key, title, body, links, checked, canSave) {
    const boxes = checked ? 'checked' : '';
    const dis = canSave ? '' : 'disabled';
    const as = links.map((href) => `<a href="${e(href)}" target="_blank" rel="noopener noreferrer">${e(L().official)}</a>`).join(' · ');
    return `<article class="item"><label class="ww-check"><input type="checkbox" data-chegada="${key}" ${boxes} ${dis}> <h2>${e(title)}</h2></label><p>${e(body)}</p><p>${as}</p></article>`;
  }

  window.wwRenderChegada = function () {
    const t = L();
    setFoot();
    document.title = 'Woonwekker — ' + t.aTitle;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = t.aIntro;
    const on = loggedIn();
    const st = chegadaState();
    const digid = (typeof lang === 'string' && lang === 'en') ? OFFICIAL.digidEn : OFFICIAL.digid;
    main.innerHTML = `<div class="page-head ww-chegada"><div class="eyebrow">${e(t.aEyebrow)}</div><h1>${e(t.aTitle)}</h1><p>${e(t.aIntro)}</p><p class="notice">${e(on ? t.aSaveOn : t.aSaveOff)}${on ? '' : ` <a href="/login/?next=${encodeURIComponent('/chegada/')}">${e(t.aLogin)}</a>`}</p></div>
      <form id="chegada-form" class="ww-chegada">
        ${item('digid', t.digidT, t.digidB, [digid], st.digid, on)}
        ${item('brp', t.brpT, t.brpB, [OFFICIAL.brp], st.brp, on)}
        ${item('bsn', t.bsnT, t.bsnB, [OFFICIAL.bsn], st.bsn, on)}
        ${item('insurance', t.insT, t.insB, [OFFICIAL.insurance, OFFICIAL.insuranceWork], st.insurance, on)}
      </form>
      <p id="chegada-status" class="ww-status" role="status"></p>`;
    if (!on) return;
    document.querySelectorAll('[data-chegada]').forEach((box) => {
      box.onchange = () => {
        const next = chegadaState();
        document.querySelectorAll('[data-chegada]').forEach((b) => { next[b.getAttribute('data-chegada')] = b.checked === true; });
        const ok = persist(next);
        const status = document.querySelector('#chegada-status');
        if (status) status.textContent = ok ? '' : L().aSaveOff;
      };
    });
  };

  window.WWChegadaOfficial = OFFICIAL;
})();
