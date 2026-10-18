/* MMM-SmartCompliments – Katalog aller Spruch-Kategorien mit den eingebauten
 * Sprüchen.
 *
 * Läuft im Browser (window.LumiraSpruchCatalog) – auf dem Spiegel und im
 * Portal (public/spruch/spruch-catalog.js, der Test prüft Gleichheit) – und in Node
 * (require: Portal-Prüfung, Tests).
 *
 * Felder je Kategorie:
 *   key    dauerhaft eindeutiger Schlüssel (Schalter, Einstellungen)
 *   list   Name der Liste in compliments.json → categories (bei den älteren
 *          Kategorien der bisherige Name, sonst = key)
 *   label  Anzeigename im Portal
 *   group  time (Tageszeit, immer dabei), general (allgemeiner Mix),
 *          weather / warning / calendar (Anlässe), duty (nach dem Einsatz)
 *   icon   Symbol, wenn der Spruch selbst keins hat (Darstellung „groß darunter“)
 *   on     ab Werk eingeschaltet (Standard: ja); bei „Nach dem Einsatz“: auch im
 *          normalen Mix (nach einem Einsatz erscheint die Kategorie immer)
 *   need   "alarm" = nur in der Feuerwehr-Ausgabe
 *   days   nur an diesen Wochentagen (0 = Sonntag)
 *   riddle Einträge sind { q, a } (Rätsel und Lösung getrennt)
 *   trigger / words  Anlass: Wetterlage bzw. Stichwörter im Kalendertitel
 * Leere oder fehlende eigene Liste = diese eingebauten Sprüche.
 */
(function (root) {
	"use strict";

	var CATEGORIES = [
		// ---------------------------------------------------------- Tageszeit
		{ key: "morning", list: "morningMessages", label: "Morgens", group: "time", icon: "🌅", items: [
			"Guten Morgen, Sonnenschein! ☀️", "Der Kaffee wartet schon ☕", "Heute wird ein guter Tag 🌅",
			"Aufstehen und strahlen! ✨", "Neuer Tag, neues Glück 🍀", "Heute kannst du alles schaffen 💪",
			"Erst Kaffee, dann Welt retten ☕🚒", "Starte mit einem Lächeln 😊", "Die Welt wartet auf dich 🌍",
			"Jeder Tag ist eine neue Chance 🌈",
			// Übergabe 13.10.2026
			"Guten Morgen! Heute ist ein guter Tag, um aus einem „Muss ich?“ ein „Mach ich!“ zu machen.",
			"Kaffee ist flüssige Motivation. Und manchmal auch die einzige Verhandlungsgrundlage.",
			"Aufstehen, lächeln, weitermachen. In genau dieser Reihenfolge. Na gut, der Kaffee darf dazwischen.",
			"Jeder Morgen ist eine neue Chance, die Snooze-Taste zu ignorieren. Theoretisch.",
			"Guten Morgen! Die Welt wartet auf dich. Sie hätte allerdings auch noch fünf Minuten warten können.",
			"Wer morgens schon lacht, hat entweder gute Laune oder den Kaffee falsch dosiert.",
			"Heute wird großartig. Und wenn nicht, machen wir wenigstens eine gute Geschichte daraus.",
			"Ein neuer Tag, ein neues Glück und dieselben Socken wie gestern. Vielleicht.",
			"Lass die Sonne rein! Oder wenigstens die Kaffeemaschine an.",
			"Guten Morgen! Du bist heute schon weiter als alle, die noch schlafen. Außer denen, die im Schlaf arbeiten.",
			"Erst Kaffee, dann Weltrettung. Wir wollen schließlich professionell bleiben.",
			"Das Leben ist zu kurz für schlechte Laune vor dem Frühstück."
		] },
		{ key: "forenoon", list: "forenoonMessages", label: "Vormittags", group: "time", icon: "☀️", items: [
			"Läuft bei dir! 💪", "Schon genug Wasser getrunken? 💧", "Bald ist Mittagspause 🍽️",
			// Übergabe 13.10.2026
			"Halbzeit bis zum Mittagessen. Jetzt bloß nicht die Motivation verlieren!",
			"Du machst das gut. Und falls nicht: Du siehst dabei bestimmt beschäftigt aus.",
			"Kleine Schritte bringen dich auch ans Ziel. Große Schritte sind nur anstrengender.",
			"Ein Problem ist nur eine Lösung, die sich noch nicht entschieden hat.",
			"Denk daran: Auch ein Montag hat nur 24 Stunden.",
			"Wer viel vorhat, darf zwischendurch auch mal so tun, als würde er nachdenken.",
			"Du musst nicht perfekt sein. Es reicht, wenn du nicht aus Versehen den Toaster mit in die Dusche nimmst.",
			"Heute schon etwas geschafft? Nein? Dann hast du immerhin noch Potenzial.",
			"Manchmal muss man einfach anfangen. Der Rest ergibt sich – oder wird eine lustige Geschichte.",
			"Ein bisschen Chaos ist nur Kreativität mit schlechter Terminplanung."
		] },
		{ key: "afternoon", list: "afternoonMessages", label: "Nachmittags", group: "time", icon: "🌤️", items: [
			"Läuft bei dir! 💪", "Halbzeit – weiter so! ⏳", "Du machst das großartig 🙌", "Schon genug Wasser getrunken? 💧",
			"Nicht nachlassen 🚀", "Der Feierabend kommt näher 😄", "Du bist auf dem richtigen Weg 👍", "Kleine Pause? 🍪",
			"Heute läuft's richtig gut 😎",
			// Übergabe 13.10.2026
			"Du hast schon die Hälfte des Tages geschafft. Jetzt bloß nicht auf der Zielgeraden einschlafen.",
			"Die besten Ideen kommen immer dann, wenn man eigentlich etwas anderes machen sollte.",
			"Durchatmen. Du bist kein Drucker, der auf Papiermangel hinweisen muss.",
			"Es ist okay, eine Pause zu machen. Selbst Akkus brauchen Strom.",
			"Wenn der Tag anstrengend ist, denk an den Feierabend. Er denkt bestimmt auch an dich.",
			"Nicht jeder Tag muss rekordverdächtig sein. Manchmal reicht es, ihn zu überleben.",
			"Lächeln! Das kostet nichts und verwirrt die schlechte Laune.",
			"Du bist nicht langsam. Du genießt nur die Spannung.",
			"Wenn Plan A nicht klappt, hat das Alphabet noch 25 weitere Buchstaben.",
			"Manchmal ist der beste Fortschritt, dass man nicht aufgegeben hat."
		] },
		{ key: "evening", list: "eveningMessages", label: "Abends", group: "time", icon: "🌙", items: [
			"Feierabend! 🌙", "Zeit zum Entspannen 🛋️", "Familienzeit ❤️", "Der Tag war deiner 🏆",
			"Jetzt Füße hochlegen 🍿", "Zeit für einen gemütlichen Abend ✨",
			// Übergabe 13.10.2026
			"Feierabend ist, wenn der Kopf aufhört, ungefragt To-do-Listen vorzulesen.",
			"Du hast heute genug getan. Jetzt darfst du einfach sein.",
			"Der Tag geht, die Gemütlichkeit kommt. Das ist ein fairer Tausch.",
			"Heute musst du niemandem mehr etwas beweisen. Außer vielleicht dir selbst, dass du die Fernbedienung findest.",
			"Gute Abende bestehen aus wenig Stress und viel Sofa.",
			"Lass den Tag los. Er hat schließlich auch dich irgendwann losgelassen.",
			"Morgen ist auch noch ein Tag. Und der darf sich heute schon mal hinten anstellen.",
			"Das Abendprogramm steht: entspannen, lachen und so tun, als wäre morgen noch ganz weit weg.",
			"Die wichtigste Aufgabe des Abends: nichts mehr müssen.",
			"Ein schöner Tag endet nicht mit einer erledigten Liste, sondern mit einem guten Gefühl."
		] },
		{ key: "night", list: "nightMessages", label: "Nachts", group: "time", icon: "😴", items: [
			"Gute Nacht 😴", "Morgen wartet ein neuer Tag 🌅",
			// Übergabe 13.10.2026
			"Schlaf gut! Deine Probleme haben morgen wieder Sprechstunde.",
			"Gute Nacht! Mögen deine Träume schöner sein als dein Wecker.",
			"Jetzt ist die perfekte Zeit, um nichts mehr zu tun. Professionell versteht sich.",
			"Schlaf ist die kostenlose Testversion eines neuen Lebensgefühls.",
			"Wer nachts um drei die Weltprobleme löst, sollte morgens um acht nicht überrascht sein, dass er müde ist.",
			"Leg das Handy weg. Ja, genau dieses hier.",
			"Gute Nacht! Die Bettdecke übernimmt ab jetzt die Verantwortung.",
			"Morgen ist die Welt noch da. Versprochen.",
			"Träume groß, schlafe tief und schnarche möglichst harmonisch.",
			"Nachtmodus an. Gedanken bitte ebenfalls dimmen."
		] },

		// ---------------------------------------------------------- Allgemein (bisherige Stimmungen)
		{ key: "herzlich", list: "familyMessages", label: "Herzlich", group: "general", icon: "❤️", items: [
			"Du siehst heute fantastisch aus! 😍", "Schön, dass es dich gibt 💛", "Bleib so wie du bist 🌈",
			"Familie ist das Wichtigste ❤️", "Zuhause ist da, wo die Familie ist 🏡", "Genieße die kleinen Momente 🌼",
			"Du bist unbezahlbar ❤️", "Nicht jeder Held trägt einen Umhang 🚒", "Retten. Löschen. Bergen. Schützen. ❤️‍🔥",
			"Möge dein Funkmelder heute ruhig bleiben 📟", "Danke für deinen Einsatz 👨‍🚒",
			// Übergabe 13.10.2026
			"Familie ist der Ort, an dem man sich auch mit zerzausten Haaren geliebt fühlen darf.",
			"Die schönsten Dinge im Leben passen selten in einen Kalender.",
			"Ein ehrliches Lächeln kann einen ganzen Tag verändern.",
			"Zuhause ist nicht nur ein Ort. Es sind die Menschen, bei denen man ankommen darf.",
			"Liebe bedeutet manchmal auch, das letzte Stück Pizza freiwillig abzugeben.",
			"Zusammen lachen ist eine der schönsten Arten, Zeit zu verbringen.",
			"Niemand muss immer stark sein. Manchmal reicht es, wenn jemand an deiner Seite bleibt.",
			"Kleine Gesten hinterlassen oft die größten Spuren.",
			"Eine Umarmung ist eine kurze Reise an einen besseren Ort.",
			"Die besten Erinnerungen entstehen oft aus den Momenten, die gar nicht geplant waren.",
			"Familie ist ein bisschen Chaos, ganz viel Herz und eine Menge Geschichten.",
			"Du musst nicht perfekt sein, um für jemanden genau richtig zu sein."
		] },
		{ key: "motivierend", list: "motivationMessages", label: "Motivierend", group: "general", icon: "💪", items: [
			"Lächeln nicht vergessen 😊", "Du bist ein Held 🦸", "Mach heute etwas, worauf du morgen stolz bist 🏆",
			"Du schaffst mehr als du glaubst 💪", "Jeder Tag ist ein Neuanfang 🌅", "Du bist stärker als dein innerer Schweinehund 🐷",
			"Ein Lächeln kostet nichts 😊", "Heute wird legendär 🌟", "Vergiss nicht zu trinken 💧",
			"Du bist heute die beste Version von dir 💯", "Alles beginnt mit dem ersten Schritt 👣", "Heute ist dein Tag! 🎉",
			"Manchmal reicht ein Lächeln, um den Tag zu verändern 😊", "Glück ist selbstgemacht 🍀",
			// Übergabe 13.10.2026
			"Du musst nicht den ganzen Weg sehen. Der nächste Schritt reicht.",
			"Fortschritt ist Fortschritt, auch wenn ihn außer dir niemand bemerkt.",
			"Mach es mit Herz oder mach einen Plan, wie du es mit Herz machst.",
			"Du bist schon durch schwierigere Tage gekommen. Vergiss das nicht.",
			"Mut bedeutet nicht, keine Angst zu haben. Mut bedeutet, es trotzdem zu versuchen.",
			"Heute ist eine gute Gelegenheit, dir selbst zu beweisen, was möglich ist.",
			"Fehler sind keine Sackgassen. Sie sind manchmal nur ziemlich schlecht ausgeschilderte Umwege.",
			"Warte nicht auf den perfekten Moment. Der ist meistens gerade im Stau.",
			"Wer aufgibt, erfährt nie, wie nah er am Ziel war.",
			"Du kannst nicht jeden Wind ändern, aber die Segel setzen.",
			"Aus kleinen Gewohnheiten werden große Veränderungen.",
			"Sei stolz auf dich. Du kennst schließlich die Kapitel, die niemand sonst gelesen hat."
		] },
		{ key: "humorvoll", list: "humorMessages", label: "Humorvoll", group: "general", icon: "😄", items: [
			"Das Leben ist zu kurz für schlechte Laune 😄", "Kaffee löst zwar nicht alles... aber vieles ☕",
			"Kalorien zählen heute nicht 🍕😂", "Der Kühlschrank glaubt an dich 🧀😂", "Erwachsen sein ist auch nur Improvisation 🤣",
			"Heute bitte keine peinlichen WhatsApps verschicken 📱", "Das Leben ist schön – besonders mit Kaffee ☕",
			// Übergabe 13.10.2026
			"Ich bin nicht faul. Ich bin im Energiesparmodus.",
			"Mein Gedächtnis ist hervorragend. Es vergisst nur gelegentlich, wo es seine hervorragenden Informationen abgelegt hat.",
			"Ordnung ist das halbe Leben. Die andere Hälfte ist die Suche nach den Dingen, die man ordentlich weggeräumt hat.",
			"Ich brauche keinen Wecker. Mein Gewissen übernimmt das – meistens mit Verspätung.",
			"Erwachsen sein bedeutet, sich über eine neue Pfanne mehr zu freuen als über einen Kinofilm.",
			"Ich habe heute Sport gemacht. Ich bin dreimal vom Sofa aufgestanden.",
			"Mein Kontostand und ich führen gerade eine Beziehung auf Abstand.",
			"Ich bin multitaskingfähig: Ich kann gleichzeitig nichts tun und dabei müde werden.",
			"Manche Menschen bringen Licht in dein Leben. Andere erinnern dich daran, dass du die Stromrechnung bezahlen musst.",
			"Ich wollte heute produktiv sein. Dann habe ich mich kurz hingesetzt.",
			"Ich bin nicht vergesslich. Ich sammle nur Überraschungen für mein zukünftiges Ich.",
			"Mein innerer Schweinehund hat heute Geburtstag. Wir feiern mit Kuchen auf dem Sofa."
		] },

		// ---------------------------------------------------------- Allgemein (neu, Version 1.1)
		{ key: "familienwahnsinn", label: "Familienwahnsinn", group: "general", icon: "🤪", items: [
			"Familie ist, wenn fünf Leute gleichzeitig etwas suchen und keiner weiß, was.",
			"Bei uns ist nicht alles perfekt. Aber immerhin ist immer was los.",
			"Familienleben: Ein bisschen Chaos, sehr viel Liebe und ständig jemand, der Hunger hat.",
			"In einer Familie ist „Ich war's nicht“ eine der meistgesprochenen Redewendungen.",
			"Ordnung ist, wenn alle wissen, wo das Chaos liegt.",
			"Der Familienplan steht fest. Bis jemand fragt: „Was gibt's zu essen?“",
			"Familienbesprechung: Alle reden, keiner hört zu, am Ende gibt's Snacks.",
			"Bei uns wird nicht gestritten. Wir führen nur sehr lebhafte Meinungsumfragen.",
			"Zuhause ist da, wo man sich gegenseitig nervt und trotzdem zusammenbleibt.",
			"Familienlogik: Wenn alle helfen sollen, dauert es länger, als es selbst zu machen.",
			"Ein ruhiger Tag mit Kindern ist wie ein Einhorn: Man hört davon, gesehen hat ihn kaum jemand.",
			"Wir sind nicht chaotisch. Wir sind eine interaktive Familie."
		] },
		{ key: "freche", label: "Freche Sprüche", group: "general", icon: "😏", items: [
			"Ich bin nicht schwierig. Ich bin eine Herausforderung mit Charme.",
			"Meine Geduld ist nicht weg. Sie macht nur gerade Urlaub.",
			"Ich diskutiere nicht. Ich erkläre nur, warum ich recht habe.",
			"Ich bin heute nicht schlecht gelaunt. Das ist mein konzentriertes Gesicht.",
			"Ich habe keine Macken. Das sind limitierte Sonderausstattungen.",
			"Manche nennen es Chaos. Ich nenne es kreative Freiheit.",
			"Ich bin offen für Vorschläge. Besonders für solche, die meinen eigenen entsprechen.",
			"Ich bin nicht spät dran. Die anderen sind einfach zu früh.",
			"Mein innerer Schweinehund hat heute die Geschäftsführung übernommen.",
			"Ich habe alles im Griff. Nur nicht unbedingt das Richtige.",
			"Ich könnte mich ändern. Aber ich möchte niemanden verwirren.",
			"Ich bin sehr pflegeleicht. Man muss nur meine Bedienungsanleitung akzeptieren."
		] },
		{ key: "liebe", label: "Liebe & Partnerschaft", group: "general", icon: "💞", items: [
			"Liebe bedeutet, den anderen auch dann zu mögen, wenn er die Decke klaut.",
			"Du bist mein Lieblingsmensch. Selbst wenn du meine Pommes klaust.",
			"Eine gute Beziehung besteht aus Liebe, Vertrauen und der Frage: „Was wollen wir heute essen?“",
			"Zusammen alt werden heißt auch, gemeinsam über dieselben schlechten Witze zu lachen.",
			"Liebe ist, wenn man die Macken des anderen kennt und sie trotzdem vermisst, wenn er nicht da ist.",
			"Du bist mein Zuhause – auch wenn du mal wieder alle Kissen beanspruchst.",
			"Wahre Liebe ist, das letzte Stück Schokolade zu teilen. Oder wenigstens darüber zu verhandeln.",
			"Die besten Dates sind manchmal einfach Sofa, Snacks und keine Termine.",
			"Eine starke Beziehung braucht keine Perfektion, sondern zwei Menschen, die immer wieder füreinander entscheiden.",
			"Gemeinsam lachen ist eine ziemlich gute Sprache der Liebe.",
			"Ich würde dich immer wieder wählen. Selbst nach deiner Playlist.",
			"Liebe ist, wenn „Wir müssen reden“ nicht automatisch Panik auslöst."
		] },
		{ key: "kinder", label: "Kinderweisheiten", group: "general", icon: "🧸", items: [
			"Wenn Erwachsene „gleich“ sagen, meinen sie manchmal eine andere Zeitzone.",
			"Ein Kinderzimmer ist ordentlich. Man muss nur wissen, wo man hintreten darf.",
			"Kinder stellen Fragen, auf die Erwachsene erst einmal eine Suchmaschine brauchen.",
			"„Warum?“ ist kein Wort. Es ist ein ganztägiges Forschungsprojekt.",
			"Kinder brauchen keine Anleitung. Sie finden selbst heraus, welche Taste man nicht drücken sollte.",
			"Ein Kind kann in fünf Minuten mehr Unordnung schaffen als ein Staubsauger beseitigen kann.",
			"Wenn es verdächtig still ist, läuft irgendwo ein sehr kreatives Projekt.",
			"Kinderlogik: Wenn ich die Augen schließe, sieht mich niemand.",
			"Das beste Spielzeug ist grundsätzlich das, mit dem gerade jemand anderes spielt.",
			"Ein Snack schmeckt immer besser vom Teller der Eltern.",
			"Kinder sind kleine Philosophen mit klebrigen Fingern.",
			"„Ich habe aufgeräumt“ bedeutet manchmal nur, dass man den Boden wieder sehen kann."
		] },
		{ key: "mutmacher", label: "Mutmacher", group: "general", icon: "🌱", items: [
			"Du musst heute nicht alles schaffen. Ein Anfang reicht.",
			"Auch kleine Schritte bringen dich weiter. Hauptsache, du bleibst in Bewegung.",
			"Ein schlechter Tag ist kein schlechtes Leben.",
			"Du darfst stolz auf dich sein, auch wenn heute nicht alles geklappt hat.",
			"Mut heißt nicht, keine Angst zu haben, sondern es trotzdem zu versuchen.",
			"Du hast schon vieles geschafft, das dir früher unmöglich vorkam.",
			"Du musst nicht perfekt sein, um etwas Gutes zu bewirken.",
			"Wenn der Weg schwierig wird, darfst du langsamer gehen. Nur gib dich nicht auf.",
			"Manchmal ist Ausruhen der mutigste nächste Schritt.",
			"Jeder neue Versuch ist eine Chance, etwas anders zu machen.",
			"Dein Tempo ist in Ordnung. Es ist kein Wettrennen.",
			"Du bist mehr als das, was heute schiefgegangen ist."
		] },
		{ key: "sarkasmus", label: "Sarkasmus", group: "general", icon: "🙃", items: [
			"Natürlich habe ich einen Plan. Ich weiß nur noch nicht, welchen.",
			"Ich liebe es, wenn ein Plan funktioniert. Kommt selten genug vor.",
			"Ich bin nicht unorganisiert. Ich arbeite mit überraschenden Abläufen.",
			"Mein Kalender ist voll. Meine Motivation hat leider keinen Termin eingetragen.",
			"Manche Probleme lösen sich von selbst. Andere warten, bis Freitag 16:55 Uhr ist.",
			"Ich habe heute schon viel erreicht. Vor allem neue Erkenntnisse darüber, was ich nicht schaffe.",
			"Teamarbeit ist, wenn mehrere Menschen gemeinsam herausfinden, wer zuständig ist.",
			"Ich bin für konstruktive Kritik. Am liebsten konstruktiv und über jemand anderen.",
			"Das war nicht mein Fehler. Das war ein unerwartetes Feature.",
			"Ich bin flexibel. Ich kann Pläne in Sekunden überdenken und in Minuten vergessen.",
			"Mein Optimismus ist ungebrochen. Er liegt nur gerade unter einer Decke.",
			"Es läuft. Die Frage ist nur, in welche Richtung."
		] },
		{ key: "sofa", label: "Sofa-Philosophie", group: "general", icon: "🛋️", items: [
			"Wenn du auf dem Sofa liegst und überlegst, aufzustehen, hast du den schwierigsten Teil schon begonnen.",
			"Manchmal ist Nichtstun genau das Richtige. Und danach ein bisschen mehr Nichtstun.",
			"Das Leben ist kurz. Die perfekte Sofaposition zu finden, darf trotzdem dauern.",
			"Wer langsam macht, hat länger Pause.",
			"Vielleicht ist der Sinn des Lebens, sich nicht jeden Tag nach dem Sinn des Lebens zu fragen.",
			"Ein freier Abend ist ein kleines Stück Luxus in Jogginghose.",
			"Die besten Gedanken kommen oft, wenn man eigentlich schlafen wollte.",
			"Man muss nicht jeden Moment nutzen. Manche Momente dürfen einfach gemütlich sein.",
			"Der Weg zur inneren Ruhe führt manchmal direkt über die Snack-Schublade.",
			"Nicht jede Pause muss produktiv sein. Manche müssen einfach eine Pause bleiben.",
			"Glück ist, wenn die Decke warm und die To-do-Liste weit weg ist.",
			"Wenn du heute nichts geschafft hast, hast du vielleicht immerhin Energie gespart."
		] },
		{ key: "feuerwehr", label: "Feuerwehr & Kameradschaft", group: "general", icon: "🚒", need: "alarm", items: [
			"Wir löschen Feuer. Für den Rest gibt's Kaffee und eine Besprechung.",
			"Kameradschaft bedeutet: Einer weiß, wo der Schlüssel liegt. Keiner weiß, wer ihn zuletzt hatte.",
			"Ein starkes Team erkennt man daran, dass sich alle aufeinander verlassen können.",
			"Übung macht den Meister. Kaffee macht die Übung geselliger.",
			"Einsatzbereit ist man nicht nur mit Ausrüstung, sondern auch mit Teamgeist.",
			"Nach dem Einsatz werden die Geräte gereinigt und die Geschichten ausgeschmückt.",
			"Gemeinsam ausrücken, gemeinsam anpacken, gemeinsam wieder nach Hause kommen.",
			"Bei der Feuerwehr ist Teamwork keine Floskel, sondern Voraussetzung.",
			"Der beste Einsatz ist der, bei dem alle gesund zurückkommen.",
			"Manchmal braucht es Mut. Immer braucht es Zusammenhalt.",
			"Wenn der Melder geht, zählt jede Hand und jeder klare Kopf.",
			"Kameradschaft endet nicht am Ende der Schicht."
		] },
		{ key: "gluecksmomente", label: "Glücksmomente", group: "general", icon: "🍀", items: [
			"Vielleicht ist heute kein besonderer Tag. Aber vielleicht passiert etwas Besonderes.",
			"Glück ist manchmal einfach ein guter Kaffee zur richtigen Zeit.",
			"Sammle Momente, nicht nur Termine.",
			"Ein kleines Lächeln kann ein großer Lichtblick sein.",
			"Manchmal ist das Gute direkt vor deiner Nase – oder im Kühlschrank.",
			"Glück muss nicht laut sein. Manchmal ist es einfach Ruhe.",
			"Die kleinen Dinge sind oft die, an die wir uns am längsten erinnern.",
			"Heute ist eine gute Gelegenheit, etwas Schönes zu bemerken.",
			"Ein schöner Moment wird noch schöner, wenn man ihn teilt.",
			"Manchmal reicht ein vertrauter Mensch, um einen Tag besser zu machen.",
			"Nicht jeder Tag ist leicht, aber oft findet sich etwas Gutes darin.",
			"Glück ist, wenn man für einen Moment denkt: Genau so darf es bleiben."
		] },
		{ key: "orakel", label: "Lumiras Tagesorakel", group: "general", icon: "🔮", items: [
			"Heute wirst du etwas suchen, das du gerade noch in der Hand hattest.",
			"Die Sterne stehen günstig. Für einen Snack ist immer Platz.",
			"Eine unerwartete Begegnung steht bevor: wahrscheinlich mit deiner To-do-Liste.",
			"Heute könnte dich eine gute Idee überraschen. Schreib sie auf, bevor sie wieder verschwindet.",
			"Deine Glückszahl ist heute die Anzahl der Minuten, die du länger schlafen möchtest.",
			"Ein kleiner Erfolg wartet auf dich. Vielleicht findest du sogar den passenden Deckel zur Dose.",
			"Heute ist ein guter Tag, um freundlich zu sein. Auch zu dir selbst.",
			"Vorsicht vor spontanen Snack-Gelüsten. Die Erfolgsaussichten sind hoch.",
			"Deine Zukunft sieht gemütlich aus. Zumindest, wenn du die Decke rechtzeitig holst.",
			"Heute könnte etwas schiefgehen. Bleib gelassen – vielleicht wird es eine gute Geschichte.",
			"Heute wird dich jemand zum Lachen bringen. Vielleicht sogar du selbst.",
			"Deine Tagesmission: mindestens einmal bewusst lächeln."
		] },
		{ key: "wissen", label: "Wissen mit Witz", group: "general", icon: "🧠", items: [
			"Eine To-do-Liste wird nicht kürzer, wenn man sie besonders streng anschaut.",
			"Der schnellste Weg, etwas zu finden, ist manchmal, einen Ersatz dafür zu kaufen.",
			"Das Wort „kurz“ ist im Alltag eine sehr flexible Zeiteinheit.",
			"Je bequemer das Sofa, desto dringender wirkt plötzlich jede Aufgabe außerhalb davon.",
			"Ein leerer Kühlschrank wird durch wiederholtes Öffnen selten voller.",
			"Wer eine Fernbedienung in der Hand hält, sucht sie besonders überzeugend.",
			"Ein Einkaufszettel hilft besonders dann, wenn man ihn nicht zu Hause liegen lässt.",
			"Je mehr Taschen ein Kleidungsstück hat, desto mehr Dinge können darin verschwinden.",
			"Ein Wecker hat eine erstaunliche Fähigkeit, genau dann zu klingeln, wenn man gerade schön träumt.",
			"Der beste Zeitpunkt für eine Pause ist oft fünf Minuten vor dem Gedanken, eine Pause zu brauchen.",
			"Der Haushalt wirkt besonders dringend, sobald man sich endlich hinsetzt.",
			"Man findet Dinge oft dort, wo man zuletzt gesucht hat – nachdem man überall anders gesucht hat."
		] },
		{ key: "raetsel", label: "Denk mal nach", group: "general", icon: "🤔", riddle: true, items: [
			{ q: "Was wird nasser, je mehr es trocknet?", a: "Ein Handtuch." },
			{ q: "Was hat viele Zähne, kann aber nicht beißen?", a: "Ein Kamm." },
			{ q: "Was hat einen Hals, aber keinen Kopf?", a: "Eine Flasche." },
			{ q: "Was läuft, hat aber keine Beine?", a: "Eine Uhr." },
			{ q: "Was gehört dir, wird aber von anderen häufiger benutzt?", a: "Dein Name." },
			{ q: "Was wird größer, je mehr man davon wegnimmt?", a: "Ein Loch." },
			{ q: "Was hat Städte, aber keine Häuser; Wälder, aber keine Bäume; und Flüsse, aber kein Wasser?", a: "Eine Landkarte." },
			{ q: "Was kann man brechen, ohne es anzufassen?", a: "Ein Versprechen." },
			{ q: "Was hat vier Beine und kann trotzdem nicht laufen?", a: "Ein Tisch." },
			{ q: "Was hat Schlüssel, aber öffnet keine Türen?", a: "Ein Klavier." },
			{ q: "Was kommt einmal in jeder Minute, zweimal in jedem Moment, aber nie in tausend Jahren vor?", a: "Der Buchstabe „M“." },
			{ q: "Was kann um die Welt reisen und bleibt dabei in einer Ecke?", a: "Eine Briefmarke." }
		] },
		{ key: "wortspiele", label: "Wortspiele", group: "general", icon: "🔤", items: [
			"Ich wollte einen Witz über Zeit erzählen. Aber dafür ist es jetzt zu spät.",
			"Der Bäcker hat sich versprochen. Jetzt hat er den Salat.",
			"Ich habe einen Job als Spiegelputzer. Das ist eine glanzvolle Karriere.",
			"Der Elektriker war geladen. Zum Glück konnte er sich wieder entladen.",
			"Der Gärtner hat den Durchblick. Er sieht alles durch die Blume.",
			"Der Mathelehrer hat Wurzeln geschlagen.",
			"Der Koch ist sauer. Da ist wohl etwas in die Brühe gegangen.",
			"Der Musiker ist ganz Ohr.",
			"Der Fotograf hat den richtigen Fokus.",
			"Der Uhrmacher hat einen an der Tick-Tack.",
			"Der Pilot hebt gerne ab. Berufskrankheit.",
			"Der Friseur hat die Lage im Griff – und die Haare auch."
		] },
		{ key: "montag", label: "Montagsmotivation", group: "general", icon: "☕", days: [1], items: [
			"Montag ist nur ein Sonntag mit zu wenig Ausschlafen.",
			"Du musst den Montag nicht lieben. Es reicht, wenn du ihn überstehst.",
			"Ein Kaffee und ein Schritt nach dem anderen. So beginnt die Woche.",
			"Montag: Die Wochenend-Version von dir verabschiedet sich langsam.",
			"Die Woche ist ein leeres Blatt. Die Kaffeeflecken kommen später.",
			"Wenn du heute schon aufgestanden bist, hast du die erste Herausforderung gemeistert.",
			"Der Montag fragt nicht, ob du bereit bist. Aber du kannst trotzdem freundlich bleiben.",
			"Mach aus dem Montag keinen Endgegner. Er ist nur das erste Level.",
			"Die Woche ist noch jung. Gib ihr eine Chance.",
			"Montag ist der Beweis, dass auch nach schönen Tagen etwas Neues beginnt.",
			"Ein guter Wochenstart muss nicht perfekt sein. Er muss nur anfangen.",
			"Heute ist ein guter Tag, um die Woche in kleinen Schritten zu erobern."
		] },
		{ key: "wochenende", label: "Wochenendmodus", group: "general", icon: "🏖️", days: [6, 0], items: [
			"Wochenendmodus aktiviert: Termine nur nach vorheriger Snack-Prüfung.",
			"Das Wochenende ist da. Die To-do-Liste kann sich hinten anstellen.",
			"Ausschlafen ist kein Hobby. Es ist eine Lebenseinstellung.",
			"Heute wird nichts überstürzt. Außer vielleicht die Bestellung beim Lieferdienst.",
			"Das Wochenende ist zu kurz für schlechte Laune und unbequeme Hosen.",
			"Plan fürs Wochenende: spontan sein – sobald der Plan steht.",
			"Wer am Samstag früh aufsteht, hat mehr vom Tag. Wer liegen bleibt, mehr vom Bett.",
			"Wochenende heißt, die Uhr etwas weniger ernst zu nehmen.",
			"Der Haushalt läuft nicht weg. Leider.",
			"Zwei freie Tage und ungefähr sieben verschiedene Pläne. Das klingt realistisch.",
			"Das beste Wochenendprogramm ist das, auf das man sich freut.",
			"Heute darf die Produktivität auch mal im Pyjama bleiben."
		] },
		{ key: "challenges", label: "Kleine Challenges", group: "general", icon: "🎯", items: [
			"Mach heute jemandem ein ehrliches Kompliment.",
			"Trink ein Glas Wasser und gönn dir eine kurze Pause.",
			"Bring jemanden zum Lächeln – notfalls mit einem richtig schlechten Witz.",
			"Räume heute eine einzige kleine Sache weg, die dich schon länger stört.",
			"Schicke einem lieben Menschen eine kurze Nachricht.",
			"Mach für eine Minute Pause und atme bewusst durch.",
			"Hör heute dein Lieblingslied einmal ganz bewusst.",
			"Sag heute einmal bewusst „Danke“ für etwas Kleines.",
			"Geh kurz ans Fenster oder nach draußen und entdecke drei Dinge, die dir gefallen.",
			"Lass heute jemand anderem die Wahl, was ihr gemeinsam macht.",
			"Lächle dich im Spiegel an. Ja, wirklich.",
			"Erledige eine kleine Sache, die dein zukünftiges Ich dir danken wird."
		] },
		{ key: "komplimente", label: "Komplimente", group: "general", icon: "🌟", items: [
			"Deine Anwesenheit macht einen Unterschied.",
			"Du musst nicht laut sein, um wichtig zu sein.",
			"Du hast mehr geschafft, als du dir manchmal zugestehst.",
			"Mit dir kann man schöne Erinnerungen sammeln.",
			"Deine Art, Dinge zu sehen, macht die Welt ein bisschen interessanter.",
			"Du machst mehr richtig, als du denkst.",
			"Du bringst etwas mit, das niemand sonst genauso mitbringt: dich selbst.",
			"Mit dir ist ein ganz normaler Tag ein bisschen schöner.",
			"Du musst heute nichts beweisen, um wertvoll zu sein.",
			"Deine Mühe zählt, auch wenn nicht jeder sie sieht.",
			"Du hast das Talent, kleine Momente besonders zu machen.",
			"Du bist für jemanden wichtiger, als du vielleicht gerade denkst."
		] },
		{ key: "nerd", label: "Nerd-Ecke", group: "general", icon: "🎮", items: [
			"Mein Leben braucht ein Update. Bitte vorher ein Backup machen.",
			"Ich habe 99 Probleme und wahrscheinlich ist ein Neustart die Lösung.",
			"Im echten Leben gibt es leider keinen Speicherpunkt vor dem Montag.",
			"Mein Gehirn hat zu viele Tabs offen und einer spielt Musik.",
			"WLAN weg? Plötzlich reden alle miteinander. Unheimlich.",
			"Ich bin nicht offline. Ich lade nur meine soziale Batterie.",
			"Fehler 404: Motivation nicht gefunden.",
			"Mein Plan war perfekt. Dann kam ein unerwartetes Update.",
			"Level des Tages: Erwachsen tun, obwohl das Tutorial fehlt.",
			"Ich brauche keine Superkräfte. Ein funktionierender Drucker wäre schon stark.",
			"Die Cloud ist toll, bis man wissen will, in welcher Wolke die Datei liegt.",
			"Respawn wäre im Alltag manchmal praktisch. Besonders montags."
		] },
		{ key: "chaos", label: "Chaos-Prognose", group: "general", icon: "🌪️", items: [
			"Die heutige Chaos-Wahrscheinlichkeit liegt bei 73 Prozent. Snacks könnten helfen.",
			"Es besteht eine hohe Chance, dass jemand fragt: „Wo ist eigentlich …?“",
			"Im Haushalt wird heute mindestens ein Gegenstand genau dort liegen, wo niemand ihn vermutet.",
			"Die Sterne sagen: Plane flexibel. Besonders, wenn Kinder mitplanen.",
			"Achtung: Ein spontaner Plan könnte durch Hunger unterbrochen werden.",
			"Die Wahrscheinlichkeit für einen verschwundenen Socken bleibt mysteriös hoch.",
			"Heute könnte Ordnung entstehen. Die Prognose ist allerdings unsicher.",
			"Es zieht eine kleine Unordnung auf. Bleib ruhig und halte einen Wäschekorb bereit.",
			"Ein überraschender Snack-Moment ist nicht auszuschließen.",
			"Die Lage bleibt dynamisch. Das ist eine höfliche Umschreibung für Chaos.",
			"Heute ist mit mindestens einer Frage zu rechnen, auf die niemand sofort eine Antwort hat.",
			"Gute Nachrichten: Das Chaos geht irgendwann vorbei. Schlechte Nachrichten: Es könnte vorher noch wachsen."
		] },
		{ key: "zitate", label: "Zitate mit Twist", group: "general", icon: "💬", items: [
			"Wer den frühen Vogel fängt, muss auch früh aufstehen. Überleg dir also, auf welcher Seite du stehst.",
			"Viele Wege führen nach Rom. Manche führen vorher zum Bäcker.",
			"Der Weg ist das Ziel. Eine Pause am Wegesrand ist trotzdem erlaubt.",
			"Was du heute kannst besorgen, darf manchmal auch bis morgen warten.",
			"Lachen ist die beste Medizin. Bei ernsthaften Beschwerden bitte trotzdem fachlichen Rat holen.",
			"Wo ein Wille ist, ist oft auch eine lange To-do-Liste.",
			"Wer zuletzt lacht, hat vielleicht einfach länger gebraucht, um den Witz zu verstehen.",
			"Aus Fehlern lernt man. Aus manchen sogar, die Anleitung vorher zu lesen.",
			"Morgenstund hat Gold im Mund. Für manche ist es allerdings Kaffee.",
			"Man soll den Tag nicht vor dem Abend loben. Aber man darf sich auf den Feierabend freuen.",
			"Kleinvieh macht auch Mist. Kleine Erfolge zählen trotzdem.",
			"Geteilte Freude ist doppelte Freude. Geteilte Hausarbeit wäre auch nicht schlecht."
		] },
		// Übergabe 13.10.2026; Versaut ab Werk aus
		{ key: "flachwitze", label: "Flachwitze", group: "general", icon: "🥁", items: [
			"Was macht ein Clown im Büro? Faxen.",
			"Wie nennt man einen Bumerang, der nicht zurückkommt? Stock.",
			"Was ist orange und wandert durch die Berge? Eine Wanderine.",
			"Was macht ein Keks unter einem Baum? Krümel.",
			"Wie nennt man einen Spanier ohne Auto? Carlos.",
			"Was liegt am Strand und spricht undeutlich? Eine Nuschel.",
			"Warum können Geister so schlecht lügen? Weil man durch sie hindurchsieht.",
			"Was ist grün und klopft an die Tür? Ein Klopfsalat.",
			"Was macht ein Mathematiker im Garten? Wurzeln ziehen.",
			"Warum ging der Pilz auf die Party? Weil er ein Champignon war.",
			"Was ist braun, klebrig und läuft durch die Wüste? Ein Karamel.",
			"Was macht ein Hai im Fitnessstudio? Er trainiert seine Beißmuskeln.",
			"Wie heißt ein Spanier, der seine Tür nicht abschließt? Francisco.",
			"Was ist weiß und stört beim Essen? Eine Lawine.",
			"Warum können Fahrräder nicht alleine stehen? Weil sie zweirädrig sind.",
			"Was macht ein Pirat am Computer? Er drückt die Enter-Taste.",
			"Wie nennt man einen sehr alten Schneemann? Pfütze.",
			"Was sagt ein großer Stift zum kleinen Stift? Wachs mal, Stift!",
			"Was macht ein Mathematiker beim Skifahren? Er rechnet mit Brüchen.",
			"Warum nehmen Skelette keine Streitigkeiten ernst? Sie haben kein Rückgrat.",
			"Was ist gelb und schießt? Eine Banone.",
			"Warum ging die Tomate über die Straße? Weil sie Ketchup machen wollte.",
			"Was macht ein Frosch auf dem Bau? Er quakt die Arbeit an.",
			"Wie nennt man einen Bären, der nichts kann? Unbärfähigt.",
			"Was sagt die Null zur Acht? Schicker Gürtel!",
			"Warum können Seeräuber keinen Kreis berechnen? Weil sie Pi raten.",
			"Was ist ein Cowboy ohne Pferd? Sattellos.",
			"Warum hat der Kalender Angst? Seine Tage sind gezählt.",
			"Was macht ein arbeitsloser Schauspieler? Er spielt keine Rolle.",
			"Wie nennt man einen Hund, der zaubern kann? Labrakadabrador.",
			"Was ist grün und sitzt auf dem Klo? Ein Kacktus.",
			"Warum gehen Ameisen nicht in die Kirche? Weil sie In-Sekten sind.",
			"Was ist ein Keks unter einem Baum? Ein schattiges Plätzchen.",
			"Was macht ein Elektriker am Strand? Er sucht nach Spannung.",
			"Warum ist der Computer erkältet? Er hat Windows offen.",
			"Was sagt ein Hammer zum Daumen? Schön, dich zu treffen!",
			"Was ist rot und schlecht für die Zähne? Ein Backstein.",
			"Warum können Fische so schlecht rechnen? Weil sie ständig mit dem Strom schwimmen.",
			"Wie nennt man einen traurigen Kaffee? Depresso.",
			"Was macht ein Schneemann im Sommer? Er schmilzt dahin.",
			"Was ist klein, grau und telefoniert? Eine Handy-Maus.",
			"Warum hat der Besen gekündigt? Er wurde ständig ausgekehrt.",
			"Was macht ein Dieb im Fitnessstudio? Er nimmt Gewichte mit.",
			"Wie nennt man einen musikalischen Wal? Einen Orka-Sänger.",
			"Was ist grün und steht vor der Tür? Ein Klopfsalat auf Besuch.",
			"Warum war der Bleistift traurig? Seine Spitze war weg.",
			"Was macht ein Känguru im Büro? Es springt von Termin zu Termin.",
			"Was ist ein Ritter ohne Helm? Unverantwortlich gerüstet.",
			"Warum können Bienen so gut rechnen? Sie kennen sich mit Summen aus.",
			"Was sagt die Wand zur anderen Wand? Wir treffen uns an der Ecke!"
		] },
		{ key: "versaut", label: "Versaut/Zweideutig", group: "general", icon: "🌶️", on: false, items: [
			"Es kommt nicht auf die Größe an. Hauptsache, man weiß, wie man damit umgeht.",
			"Manche Dinge machen zu zweit einfach mehr Spaß.",
			"Wer sauber denkt, hat eindeutig zu wenig Fantasie.",
			"Es gibt Dinge, die macht man am besten langsam. Und andere, bevor jemand nach Hause kommt.",
			"Nicht alles, was sich gut anfühlt, ist auch gut für den Rücken.",
			"Die besten Dinge im Leben sind manchmal ein bisschen unanständig.",
			"Man sollte öfter das tun, was einen glücklich macht. Und gelegentlich die Tür abschließen.",
			"Erfahrung ist, wenn man weiß, was man tut. Selbst wenn es hinterher peinlich wird.",
			"Manche haben Schmetterlinge im Bauch. Andere eher einen ausgewachsenen Zoo.",
			"Ein bisschen Spannung muss sein. Sonst schläft am Ende noch jemand ein.",
			"Es ist nicht immer das Werkzeug entscheidend. Manchmal kommt es auf die Technik an.",
			"Wer zu früh aufgibt, verpasst manchmal den besten Teil.",
			"Es gibt Fragen, auf die man lieber nicht antwortet, wenn Kinder im Raum sind.",
			"Ein gutes Vorspiel ist wichtig. Deshalb lese ich erst die Bedienungsanleitung.",
			"Wer den ganzen Tag brav ist, braucht abends einen guten Ausgleich.",
			"Manche Knöpfe sollte man einfach nicht drücken. Andere gleich zweimal.",
			"Man muss nicht alles aussprechen. Ein Blick reicht manchmal völlig.",
			"Ich mag Menschen mit Tiefgang. Oberflächlich wird es schließlich schnell langweilig.",
			"Vertrauen ist wichtig. Besonders, wenn einer sagt: „Ich weiß genau, was ich tue.“",
			"Wer behauptet, nur auf die inneren Werte zu achten, hat noch nie eine Fernbedienung gesucht.",
			"Manche Überraschungen sind schöner, wenn man sie auspackt.",
			"Es ist wie beim Tanzen: Der richtige Rhythmus macht den Unterschied.",
			"Ein bisschen schmutzige Fantasie hält die grauen Zellen auf Trab.",
			"Nicht jede heiße Angelegenheit braucht einen Feuerlöscher. Aber sicher ist sicher.",
			"Ich bin nicht zweideutig. Du interpretierst nur besonders kreativ.",
			"Manche Dinge sind wie guter Wein: Mit der richtigen Temperatur werden sie interessanter.",
			"Wer immer nur anständig ist, hat vermutlich noch nie die richtige Gelegenheit gehabt.",
			"Das Geheimnis einer langen Beziehung? Abwechslung. Heute bestimmt einer, morgen der andere.",
			"Ich wollte etwas Unanständiges sagen. Aber dann fiel mir ein, dass Lumira mithört.",
			"Kopfkino ist kostenlos. Die Handlung bestimmt die eigene Fantasie.",
			"Für jeden Topf gibt es einen Deckel. Für manche Töpfe sogar mehrere.",
			"Manche mögen es heiß. Andere suchen nur die Fernbedienung.",
			"Erst die Arbeit, dann das Vergnügen. Es sei denn, man arbeitet im Vergnügungsbereich.",
			"Nicht alles, was glänzt, ist Gold. Und nicht alles, was wackelt, ist kaputt.",
			"Wer zu viel verspricht, muss irgendwann liefern.",
			"Manche Situationen brauchen Fingerspitzengefühl. Andere eine Gebrauchsanweisung.",
			"Manchmal ist weniger mehr. Manchmal ist mehr aber auch sehr überzeugend.",
			"Ich habe nichts Schlimmes gedacht. Ich habe nur sehr gründlich nachgedacht.",
			"Ein gutes Timing ist die halbe Miete. Die andere Hälfte ist die richtige Gelegenheit.",
			"Es gibt Menschen, die bringen dich zum Lachen. Und solche, bei denen du plötzlich ganz still wirst."
		] },

		// ---------------------------------------------------------- Anlass: amtliche Wetterwarnung (DWD)
		// {event} = Art der Warnung, z. B. „Sturmböen“
		{ key: "warnung", label: "Amtliche Wetterwarnung", group: "warning", icon: "⚠️", trigger: "warnung", items: [
			"Wetterwarnung für euren Ort: {event}.\nPasst gut auf euch auf.",
			"Wetterwarnung: {event}.\nLieber etwas mehr Zeit einplanen.",
			"Ungemütliches Wetter geht vorüber.\nBis dahin: sicher bleiben."
		] },

		// ---------------------------------------------------------- Anlass: Wetter
		{ key: "wetter_sonne", label: "Sonnig", group: "weather", icon: "☀️", trigger: "sonne", items: [
			"Sonnige Momente machen das Leben einfach schöner.",
			"Die Sonne ist da – nichts wie raus!",
			"Heute lacht die Sonne. Lacht einfach mit.",
			"Sonnenbrille nicht vergessen. 😎"
		] },
		{ key: "wetter_regen", label: "Regen", group: "weather", icon: "🌧️", trigger: "regen", items: [
			"Schirm nicht vergessen. ☔",
			"Manchmal ist Regen die perfekte Ausrede für einen gemütlichen Tag.",
			"Regen ist nur Wetter mit Extra-Kuschelfaktor.",
			"Gummistiefel-Wetter! Pfützenspringen ist ausdrücklich erlaubt."
		] },
		{ key: "wetter_schnee", label: "Schnee", group: "weather", icon: "❄️", trigger: "schnee", items: [
			"Vielleicht fällt heute Schnee. ❄️",
			"Es schneit! Zeit für warme Socken und Kakao.",
			"Schnee macht alles ein bisschen leiser und schöner."
		] },
		{ key: "wetter_gewitter", label: "Gewitter", group: "weather", icon: "⛈️", trigger: "gewitter", items: [
			"Draußen grummelt es – drinnen ist es gemütlich.",
			"Gewitter ziehen vorbei. Bis dahin: Tee und Decke."
		] },
		{ key: "wetter_nebel", label: "Nebel", group: "weather", icon: "🌫️", trigger: "nebel", items: [
			"Nebel draußen – Durchblick drinnen.",
			"Neblig heute: lieber mit Licht und etwas mehr Zeit unterwegs sein."
		] },
		{ key: "wetter_hitze", label: "Hitze", group: "weather", icon: "🌡️", trigger: "hitze", items: [
			"Heute wird es heiß.\nViel trinken. 💧",
			"Sonnencreme, Wasser, Schatten – das Erfolgsrezept für heute."
		] },
		{ key: "wetter_frost", label: "Frost", group: "weather", icon: "🧊", trigger: "frost", items: [
			"Heute Morgen könnte es glatt sein.\nFahrt vorsichtig.",
			"Frostig draußen – Mütze auf und warm einpacken."
		] },
		{ key: "wetter_wind", label: "Wind", group: "weather", icon: "🌬️", trigger: "wind", items: [
			"Heute wird es windig.\nLose Gegenstände sichern.",
			"Windig heute – gut festhalten, besonders die Frisur."
		] },

		// ---------------------------------------------------------- Anlass: Kalender (Stichwörter im Termintitel)
		// {title} = Titel des Termins
		{ key: "kal_geburtstag", label: "Geburtstag im Kalender", group: "calendar", icon: "🎂", words: "Geburtstag, Bday, Birthday", items: [
			"Alles Liebe zum Geburtstag!",
			"Heute wird gefeiert: {title}"
		] },
		{ key: "kal_feuerwehr", label: "Feuerwehrtermin", group: "calendar", icon: "🚒", need: "alarm", words: "Feuerwehr, FFW, Übung, Atemschutz, Lehrgang", items: [
			"Starke Menschen machen den Unterschied.\nViel Erfolg bei: {title}!",
			"Heute steht Feuerwehr auf dem Plan. Gutes Gelingen!"
		] },
		{ key: "kal_sport", label: "Sport & Training", group: "calendar", icon: "⚽", words: "Training, Sport, Fußball, Handball, Schwimmen, Turnier, Turnen", items: [
			"Training ist der erste Schritt zu neuen Erfolgen.\nViel Spaß dabei!",
			"Heute: {title}. Gebt alles – und habt Spaß!"
		] },
		{ key: "kal_ausflug", label: "Familienausflug", group: "calendar", icon: "🏔️", words: "Ausflug, Urlaub, Zoo, Freizeitpark, Wanderung, Reise", items: [
			"Gemeinsame Abenteuer sind die schönsten Erinnerungen.",
			"Heute geht's los: {title}. Viel Spaß!"
		] },

		// ---------------------------------------------------------- Nach dem Einsatz (Feuerwehr-Ausgabe)
		{ key: "afterDuty", list: "afterDutyMessages", label: "Nach dem Einsatz", group: "duty", icon: "❤️", need: "alarm", on: false, items: [
			"❤️ Danke, dass du heute für andere da warst.",
			"🚒 Schön, dass du wieder sicher zuhause bist.",
			"❤️ Heute warst du im Einsatz – jetzt gehört der Tag wieder dir.",
			"👨‍🚒 Danke für deinen Einsatz heute.",
			"❤️ Wir sind stolz auf dich.",
			// Übergabe 13.10.2026
			"Einsatz beendet. Kameradschaft bleibt.",
			"Nicht jeder sieht, was wir leisten. Aber wir wissen, warum wir es tun.",
			"Gemeinsam ausgerückt, gemeinsam zurückgekehrt.",
			"Gute Arbeit erkennt man nicht nur am Ergebnis, sondern auch am Team dahinter.",
			"Der Einsatz ist vorbei. Die Geschichten am Gerätehaus fangen gerade erst an.",
			"Manchmal ist der wichtigste Teil des Einsatzes, dass alle wieder gesund nach Hause kommen.",
			"Ein starkes Team besteht nicht aus perfekten Menschen, sondern aus Menschen, die sich aufeinander verlassen.",
			"Adrenalin runter, Puls runter, Kaffee hoch.",
			"Heute wieder gezeigt, was Zusammenhalt bedeutet.",
			"Die Ausrüstung wird gereinigt. Der Teamgeist bleibt sauber.",
			"Nicht jeder Held trägt einen Umhang. Manche tragen Einsatzkleidung.",
			"Nach dem Einsatz ist vor der nächsten Übung. Aber jetzt erst mal durchatmen."
		] }
	];

	CATEGORIES.forEach(function (c) {
		if (!c.list) c.list = c.key;
		if (c.on === undefined) c.on = true;
	});

	// Gruppen in der Reihenfolge des Portals
	var GROUPS = [
		["general", "Allgemeine Sprüche"],
		["warning", "Anlass: amtliche Wetterwarnung"],
		["weather", "Anlass: Wetter"],
		["calendar", "Anlass: Kalender"],
		["time", "Tageszeit"],
		["duty", "Nach dem Einsatz"]
	];

	// Reihenfolge der Anlässe (Portal: einstellbar)
	var TRIGGER_GROUPS = [["warning", "Wetterwarnung"], ["calendar", "Kalender"], ["weather", "Wetter"]];

	function byKey(key) {
		for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].key === key) return CATEGORIES[i];
		return null;
	}

	function byList(list) {
		for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].list === list) return CATEGORIES[i];
		return null;
	}

	var api = { CATEGORIES: CATEGORIES, GROUPS: GROUPS, TRIGGER_GROUPS: TRIGGER_GROUPS, byKey: byKey, byList: byList };
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	else root.LumiraSpruchCatalog = api;
})(typeof window !== "undefined" ? window : globalThis);
