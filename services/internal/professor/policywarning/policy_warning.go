package policywarning

import (
	"strings"
	"unicode"

	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
)

const (
	ReviewModerationWarningCode = "review_moderation"
	BiasFavoritismWarningCode   = "bias_favoritism_allegation"

	perspectiveWarningTitle   = "Want to take another look?"
	perspectiveWarningMessage = "Some of the wording in your review might come across as offensive and inappropriate. If that wasn't your intention, you can edit it and try again."

	biasFavoritismWarningTitle   = "Want to take another look?"
	biasFavoritismWarningMessage = "Your review may mention bias, favoritism, or another sensitive claim. Clear, specific classroom details are easiest for others to understand."
)

const outcomeBiasWindowTokens = 8

var clearBiasFavoritismTerms = []string{
	"racist",
	"racism",
	"racial bias",
	"ethnic bias",
	"discrimination",
	"discriminatory",
	"favoritism",
	"favouritism",
	"plays favorites",
	"plays favourites",
	"pick favorites",
	"pick favourites",
	"has favorites",
	"has favourites",
	"favorite students",
	"favourite students",
	"favorites students",
	"favourites students",
	"nepotism",
	"cronyism",
	"xenophobic",
	"xenophobia",
	"sexist",
	"sexism",
	"male chauvinist",
	"misogynist",
	"misogyny",
	"tribalism",
	"sectarian",
	"sectarianism",
	"wasta",
	"عنصري",
	"عنصريه",
	"ذكوري",
	"ذكوريه",
	"تمييز",
	"تمييزي",
	"تفرقه",
	"تحيز",
	"متحيز",
	"متحيزه",
	"محاباه",
	"محسوبيه",
	"مفضلين",
	"مفضلات",
	"واسطه",
	"طائفي",
	"طائفيه",
	"تعصب قبلي",
	"عنده قبليه",
	"عندها قبليه",
}

var guardedBiasActions = []string{
	"prefer",
	"prefers",
	"preferred",
	"favor",
	"favors",
	"favours",
	"favored",
	"favoured",
	"discriminate",
	"discriminates",
	"discriminated",
	"biased",
	"bias",
	"unfair",
	"unfairly",
	"fail",
	"fails",
	"failing",
	"failed",
	"ignore",
	"ignores",
	"ignored",
	"target",
	"targets",
	"targeted",
	"punish",
	"punishes",
	"punished",
	"lets pass",
	"goes easy",
	"يرسب",
	"يرسبهم",
	"يفشل",
	"يفشلهم",
	"يتجاهل",
	"يطنش",
	"يظلم",
	"يكره",
	"يحط راسه",
	"يفضل",
	"تفضل",
	"يفضلون",
	"يفضلهم",
	"يميل",
	"يميلون",
	"يفرق",
	"يفرقون",
	"تفرق",
	"تفرقون",
	"يميز",
	"يميزه",
	"يميزون",
	"يتحيز",
	"ينحاز",
	"متحيز",
}

var implicitBiasActions = []string{
	"discriminate",
	"discriminates",
	"discriminated",
	"discriminatory",
	"favoritism",
	"favouritism",
	"يميز",
	"يميزه",
	"يميزون",
	"يفرق",
	"يفرقون",
	"تفرق",
	"تفرقون",
}

var implicitBiasContextTerms = []string{
	"class",
	"grades",
	"grading",
	"marks",
	"students",
	"الصف",
	"صف",
	"الكلاس",
	"كلاس",
	"درجات",
	"علامات",
	"طلاب",
	"الطلاب",
	"طالب",
	"طالبه",
	"طلبه",
}

var connectionBiasGroups = []string{
	"friend",
	"friends",
	"connections",
	"relative",
	"relatives",
	"family",
	"صديق",
	"اصدقاء",
	"اصحاب",
	"ربع",
	"ربعه",
	"شلته",
	"معارف",
	"معارفه",
	"قرايب",
	"اقارب",
	"عايله",
	"عائله",
	"عوائل",
}

var favoritismBiasActions = []string{
	"prefer",
	"prefers",
	"preferred",
	"favor",
	"favors",
	"favours",
	"favored",
	"favoured",
	"يفضل",
	"تفضل",
	"يفضلون",
	"يفضلهم",
	"يميل",
	"يميلون",
}

var guardedBiasOutcomeActions = []string{
	"treat",
	"treats",
	"treating",
	"treated",
	"give",
	"gives",
	"giving",
	"gave",
	"pass",
	"passes",
	"passing",
	"passed",
	"help",
	"helps",
	"helping",
	"helped",
	"support",
	"supports",
	"supported",
	"يعامل",
	"يتعامل",
	"تتعامل",
	"يعاملون",
	"يعطي",
	"تعطي",
	"يعطون",
	"يعطيهم",
	"يعطيهن",
	"يزيد",
	"يزيدهم",
	"يرفع",
	"يرفعهم",
	"ينقص",
	"ينقصهم",
	"ينزل",
	"ينزلهم",
	"يعدي",
	"يعديهم",
	"يمشي",
	"يمشيهم",
	"يرسب",
	"يرسبهم",
	"يفشل",
	"يفشلهم",
	"ينجح",
	"ينجحهم",
	"يساعد",
	"تساعد",
	"يساعدهم",
	"يساعدون",
	"يدعم",
	"يدعمهم",
	"يهتم",
	"يراعي",
	"ينصف",
}

var guardedBiasContextTerms = []string{
	"only",
	"better",
	"worse",
	"more",
	"less",
	"higher",
	"lower",
	"extra",
	"easier",
	"harder",
	"different",
	"differently",
	"selectively",
	"unfair",
	"unfairly",
	"easy on",
	"hard on",
	"فقط",
	"احسن",
	"افضل",
	"اقل",
	"اعلى",
	"ادنى",
	"اسهل",
	"اصعب",
	"غير",
	"فرق",
	"بزياده",
	"زيادة",
	"يعدي",
	"ينجح",
	"يرسب",
	"يفشل",
	"رسوب",
	"نجاح",
	"على حساب",
	"معين",
	"معينه",
	"معينين",
	"بشكل مختلف",
}

var guardedBiasGroups = []string{
	"nationality",
	"nationalities",
	"gender",
	"male",
	"female",
	"girls",
	"boys",
	"women",
	"men",
	"emirati",
	"emiratis",
	"local",
	"locals",
	"foreign",
	"foreigners",
	"international",
	"international students",
	"arab",
	"arabs",
	"asian",
	"asians",
	"south asian",
	"south asians",
	"indian",
	"indians",
	"pakistani",
	"pakistanis",
	"bangladeshi",
	"bangladeshis",
	"filipino",
	"filipinos",
	"egyptian",
	"egyptians",
	"syrian",
	"syrians",
	"jordanian",
	"jordanians",
	"lebanese",
	"palestinian",
	"palestinians",
	"yemeni",
	"yemenis",
	"sudanese",
	"iranian",
	"iranians",
	"afghan",
	"afghans",
	"african",
	"africans",
	"western",
	"westerners",
	"white",
	"black",
	"citizen",
	"citizens",
	"uae national",
	"uae nationals",
	"emirati national",
	"emirati nationals",
	"gulf",
	"khaleeji",
	"khaleejis",
	"gcc",
	"expat",
	"expats",
	"resident",
	"residents",
	"non local",
	"non locals",
	"nonlocal",
	"nonlocals",
	"religion",
	"religions",
	"muslim",
	"muslims",
	"christian",
	"christians",
	"tribe",
	"tribes",
	"tribal",
	"bedouin",
	"certain students",
	"specific students",
	"certain people",
	"طالب واحد",
	"طالب بطالب",
	"جنسيه",
	"جنسيات",
	"عرق",
	"اعراق",
	"لون",
	"ابيض",
	"بيض",
	"اسود",
	"سود",
	"اسمر",
	"هنود",
	"هندي",
	"باكستاني",
	"باكستانيين",
	"بنغالي",
	"بنغال",
	"بنغلاديشي",
	"بنغلاديشيين",
	"فلبيني",
	"فلبينيين",
	"مصري",
	"مصريين",
	"سوريين",
	"اردني",
	"اردنيين",
	"لبناني",
	"لبنانيين",
	"فلسطيني",
	"فلسطينيين",
	"يمني",
	"يمنيين",
	"سوداني",
	"سودانيين",
	"افغاني",
	"افغان",
	"افغانيين",
	"افريقي",
	"افريقيين",
	"غربي",
	"غربيين",
	"اسيويين",
	"خليجي",
	"خليجيين",
	"سعودي",
	"سعوديين",
	"كويتي",
	"كويتيين",
	"قطري",
	"قطريين",
	"بحريني",
	"بحرينيين",
	"عماني",
	"عمانيين",
	"عربي",
	"عرب",
	"مواطن",
	"مواطنين",
	"مواطنه",
	"مواطنات",
	"اماراتي",
	"اماراتيين",
	"عيال البلاد",
	"اهل البلاد",
	"اهل الدار",
	"محلي",
	"محليين",
	"لوكل",
	"لوكلز",
	"وافد",
	"وافدين",
	"مقيم",
	"مقيمين",
	"غير مواطن",
	"غير مواطنين",
	"دولي",
	"دوليين",
	"طلاب دوليين",
	"اجنبي",
	"اجانب",
	"اديان",
	"مسلم",
	"مسلمين",
	"مسيحي",
	"مسيحيين",
	"قبيله",
	"قبائل",
	"قبايل",
	"بنت",
	"بنات",
	"طالبات",
	"طالبات معينات",
	"اولاد",
	"ولد",
	"شباب",
	"حريم",
	"نساء",
	"رجال",
	"ذكور",
	"اناث",
	"جنس",
	"طلاب معينين",
	"ناس معينين",
	"ناس معينه",
	"ناس و ناس",
	"ناس وناس",
	"الطلاب اللي يعرفهم",
}

// arabicSuffixes are common possessive, object, and plural-possessive suffixes
// that attach directly to Arabic nouns and verbs without a space.
// Ordered longest-first so the most specific match is stripped.
var arabicSuffixes = []string{
	"هم", // their / them (masc. plural)
	"هن", // their / them (fem. plural)
	"كم", // your (masc. plural)
	"كن", // your (fem. plural)
	"نا", // our / us
	"ها", // her / its / them (fem.)
	"ني", // me (verb object)
	"ه",  // his / it
	"ك",  // your (singular)
	"ي",  // my
}

// arabicPluralSuffixes are plural endings that may contract before a
// possessive suffix (e.g. مواطنين+هم → مواطنيهم → after first strip: مواطني).
// Stripping these reveals the singular/base form for list matching.
var arabicPluralSuffixes = []string{
	"ين", // masc. plural (sound)
	"ي",  // contracted plural stem (مواطني)
	"ات", // fem. plural (sound)
	"ون", // masc. plural (nominative)
}

// stripArabicSuffix removes the longest matching possessive/object suffix.
// It applies up to two passes: once for the possessive suffix, then once for
// a plural ending, so contracted forms like مواطنيهم (مواطنين+هم) resolve to
// مواطن and match مواطن or مواطنين in the word lists.
func stripArabicSuffix(word string) string {
	stem := stripOneSuffix(word, arabicSuffixes)
	if stem != word {
		// Second pass: strip a plural ending from the remaining stem
		stem2 := stripOneSuffix(stem, arabicPluralSuffixes)
		if stem2 != stem {
			return stem2
		}
	}
	return stem
}

func stripOneSuffix(word string, suffixes []string) string {
	runes := []rune(word)
	for _, suf := range suffixes {
		sr := []rune(suf)
		if len(runes) > len(sr)+1 && strings.HasSuffix(word, suf) {
			return string(runes[:len(runes)-len(sr)])
		}
	}
	return word
}

func ReviewWarning(text string, acknowledged *string) *v1.ReviewPolicyWarning {
	if acknowledged != nil && *acknowledged == BiasFavoritismWarningCode {
		return nil
	}

	if !ContainsBiasFavoritismAllegation(text) {
		return nil
	}

	return &v1.ReviewPolicyWarning{
		Code:       BiasFavoritismWarningCode,
		ReasonCode: "bias_favoritism",
		Title:      biasFavoritismWarningTitle,
		Message:    biasFavoritismWarningMessage,
	}
}

func ReviewModerationWarning(text string, contentSafetyFlagged bool) *v1.ReviewPolicyWarning {
	biasFavoritismFlagged := ContainsBiasFavoritismAllegation(text)

	if contentSafetyFlagged {
		return &v1.ReviewPolicyWarning{
			Code:       ReviewModerationWarningCode,
			ReasonCode: "content_safety",
			Title:      perspectiveWarningTitle,
			Message:    perspectiveWarningMessage,
		}
	}

	if !biasFavoritismFlagged {
		return nil
	}

	return &v1.ReviewPolicyWarning{
		Code:       ReviewModerationWarningCode,
		ReasonCode: "bias_favoritism",
		Title:      biasFavoritismWarningTitle,
		Message:    biasFavoritismWarningMessage,
	}
}

func ContainsBiasFavoritismAllegation(text string) bool {
	normalized := normalizePolicyWarningText(text)
	if normalized == "" {
		return false
	}

	for _, term := range clearBiasFavoritismTerms {
		if containsPolicyPhrase(normalized, term) && !hasNegatedPolicyPhrase(normalized, term) {
			return true
		}
	}

	return containsGuardedBiasPattern(normalized)
}

func containsGuardedBiasPattern(normalized string) bool {
	if containsImplicitBiasPattern(normalized) {
		return true
	}

	if containsConnectionBiasPattern(normalized) {
		return true
	}

	if !containsAnyPolicyPhrase(normalized, guardedBiasGroups) {
		return false
	}

	if containsActionBiasPattern(normalized, guardedBiasGroups, guardedBiasActions) {
		return true
	}

	return containsOutcomeBiasPattern(normalized, guardedBiasGroups)
}

func containsImplicitBiasPattern(normalized string) bool {
	return containsTwoPartBiasPattern(normalized, implicitBiasActions, implicitBiasContextTerms)
}

func containsConnectionBiasPattern(normalized string) bool {
	if !containsAnyPolicyPhrase(normalized, connectionBiasGroups) {
		return false
	}

	if containsActionBiasPattern(normalized, connectionBiasGroups, favoritismBiasActions) {
		return true
	}

	return containsOutcomeBiasPattern(normalized, connectionBiasGroups)
}

func containsActionBiasPattern(normalized string, groups, actions []string) bool {
	for _, action := range actions {
		if !containsPolicyPhrase(normalized, action) || hasNegatedPolicyPhrase(normalized, action) {
			continue
		}
		actionPositions := phrasePositions(normalized, action)
		if len(actionPositions) == 0 {
			continue
		}

		for _, group := range groups {
			if !containsPolicyPhrase(normalized, group) {
				continue
			}
			groupPositions := phrasePositions(normalized, group)
			if len(groupPositions) == 0 {
				continue
			}
			if positionsWithinWindow(actionPositions, groupPositions, nil, outcomeBiasWindowTokens) {
				return true
			}
		}
	}

	return false
}

func containsTwoPartBiasPattern(normalized string, actions, contexts []string) bool {
	for _, action := range actions {
		if !containsPolicyPhrase(normalized, action) || hasNegatedPolicyPhrase(normalized, action) {
			continue
		}
		actionPositions := phrasePositions(normalized, action)
		if len(actionPositions) == 0 {
			continue
		}

		for _, context := range contexts {
			if !containsPolicyPhrase(normalized, context) {
				continue
			}
			contextPositions := phrasePositions(normalized, context)
			if len(contextPositions) == 0 {
				continue
			}
			if positionsWithinWindow(actionPositions, contextPositions, nil, outcomeBiasWindowTokens) {
				return true
			}
		}
	}

	return false
}

func containsOutcomeBiasPattern(normalized string, groups []string) bool {
	for _, action := range guardedBiasOutcomeActions {
		if !containsPolicyPhrase(normalized, action) || hasNegatedPolicyPhrase(normalized, action) {
			continue
		}
		actionPositions := phrasePositions(normalized, action)
		if len(actionPositions) == 0 {
			continue
		}

		for _, group := range groups {
			if !containsPolicyPhrase(normalized, group) {
				continue
			}
			groupPositions := phrasePositions(normalized, group)
			if len(groupPositions) == 0 {
				continue
			}

			for _, context := range guardedBiasContextTerms {
				if !containsPolicyPhrase(normalized, context) {
					continue
				}
				contextPositions := phrasePositions(normalized, context)
				if len(contextPositions) == 0 {
					continue
				}
				if positionsWithinWindow(actionPositions, groupPositions, contextPositions, outcomeBiasWindowTokens) {
					return true
				}
			}
		}
	}

	return false
}

func positionsWithinWindow(a, b, c []int, window int) bool {
	for _, ai := range a {
		for _, bi := range b {
			if len(c) == 0 {
				if max(ai, bi)-min(ai, bi) <= window {
					return true
				}
				continue
			}
			for _, ci := range c {
				minPos := min(ai, min(bi, ci))
				maxPos := max(ai, max(bi, ci))
				if maxPos-minPos <= window {
					return true
				}
			}
		}
	}
	return false
}

func normalizePolicyWarningText(text string) string {
	var b strings.Builder
	previousSpace := true

	for _, r := range strings.ToLower(text) {
		if isArabicMark(r) || unicode.Is(unicode.Mn, r) {
			continue
		}

		r = foldArabicLetter(r)

		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
			previousSpace = false
			continue
		}

		if !previousSpace {
			b.WriteRune(' ')
			previousSpace = true
		}
	}

	fields := strings.Fields(b.String())
	for i, field := range fields {
		fields[i] = collapseArabicElongation(field)
	}
	return strings.Join(fields, " ")
}

func collapseArabicElongation(word string) string {
	var b strings.Builder
	runes := []rune(word)
	for i := 0; i < len(runes); {
		r := runes[i]
		j := i + 1
		for j < len(runes) && runes[j] == r {
			j++
		}

		repeatCount := j - i
		if isArabicLetter(r) && repeatCount >= 3 {
			b.WriteRune(r)
		} else {
			for k := i; k < j; k++ {
				b.WriteRune(runes[k])
			}
		}
		i = j
	}

	return b.String()
}

func foldArabicLetter(r rune) rune {
	switch r {
	case 'أ', 'إ', 'آ', 'ٱ':
		return 'ا'
	case 'ؤ':
		return 'و'
	case 'ئ', 'ى':
		return 'ي'
	case 'ة':
		return 'ه'
	default:
		return r
	}
}

func isArabicMark(r rune) bool {
	return r == 'ـ' ||
		(r >= '\u064B' && r <= '\u065F') ||
		r == '\u0670' ||
		(r >= '\u06D6' && r <= '\u06ED')
}

func containsAnyPolicyPhrase(normalized string, phrases []string) bool {
	for _, phrase := range phrases {
		if containsPolicyPhrase(normalized, phrase) {
			return true
		}
	}
	return false
}

func containsAnyNonNegatedPolicyPhrase(normalized string, phrases []string) bool {
	for _, phrase := range phrases {
		if containsPolicyPhrase(normalized, phrase) && !hasNegatedPolicyPhrase(normalized, phrase) {
			return true
		}
	}
	return false
}

func containsPolicyPhrase(normalized, phrase string) bool {
	normalizedPhrase := normalizePolicyWarningText(phrase)
	if normalizedPhrase == "" {
		return false
	}
	haystack := " " + normalized + " "

	// Exact word-boundary match.
	if strings.Contains(haystack, " "+normalizedPhrase+" ") {
		return true
	}

	if !containsArabicLetter(normalizedPhrase) {
		return false
	}

	// Try prepended Arabic definite article / conjunction prefixes.
	for _, prefix := range []string{"ال", "و", "ف", "ب", "ل", "وال", "فال", "بال", "لل"} {
		if strings.Contains(haystack, " "+prefix+normalizedPhrase+" ") {
			return true
		}
	}

	// For single-word Arabic phrases, also try matching against suffix-stripped
	// tokens in the haystack. This handles possessive/object suffixes such as
	// اصحابه (his friends) → اصحاب, or وافدينه → وافدين.
	if !strings.Contains(normalizedPhrase, " ") {
		for _, token := range strings.Fields(normalized) {
			if !containsArabicLetter(token) {
				continue
			}
			stem := stripArabicSuffix(token)
			if stem == token {
				continue // no suffix was stripped; already checked via exact match
			}
			if stem == normalizedPhrase {
				return true
			}
			// Also handle prefix+stem (e.g. واصحابه → strip ه → واصحاب → strip و → اصحاب)
			for _, prefix := range []string{"ال", "و", "ف", "ب", "ل", "وال", "فال", "بال", "لل"} {
				if strings.HasPrefix(stem, prefix) {
					inner := strings.TrimPrefix(stem, prefix)
					if inner == normalizedPhrase {
						return true
					}
				}
			}
		}
	}

	return false
}

func phrasePositions(normalized, phrase string) []int {
	normalizedPhrase := normalizePolicyWarningText(phrase)
	if normalizedPhrase == "" {
		return nil
	}

	tokens := strings.Fields(normalized)
	phraseTokens := strings.Fields(normalizedPhrase)
	if len(phraseTokens) == 0 || len(phraseTokens) > len(tokens) {
		return nil
	}

	var positions []int
	for i := 0; i <= len(tokens)-len(phraseTokens); i++ {
		matched := true
		for j, phraseToken := range phraseTokens {
			if !policyTokenMatches(tokens[i+j], phraseToken) {
				matched = false
				break
			}
		}
		if matched {
			positions = append(positions, i)
		}
	}
	return positions
}

func policyTokenMatches(token, phraseToken string) bool {
	if token == phraseToken {
		return true
	}
	if !containsArabicLetter(phraseToken) {
		return false
	}

	for _, prefix := range []string{"ال", "و", "ف", "ب", "ل", "وال", "فال", "بال", "لل"} {
		if strings.TrimPrefix(token, prefix) == phraseToken {
			return true
		}
	}

	stem := stripArabicSuffix(token)
	if stem == phraseToken {
		return true
	}
	for _, prefix := range []string{"ال", "و", "ف", "ب", "ل", "وال", "فال", "بال", "لل"} {
		if strings.TrimPrefix(stem, prefix) == phraseToken {
			return true
		}
	}

	return false
}

func containsArabicLetter(text string) bool {
	for _, r := range text {
		if isArabicLetter(r) {
			return true
		}
	}
	return false
}

func isArabicLetter(r rune) bool {
	return r >= '\u0600' && r <= '\u06FF' && unicode.IsLetter(r)
}

func hasNegatedPolicyPhrase(normalized, phrase string) bool {
	normalizedPhrase := normalizePolicyWarningText(phrase)
	if normalizedPhrase == "" {
		return false
	}

	negationPrefixes := []string{
		"not",
		"not a",
		"not being",
		"no",
		"without",
		"مو",
		"مب",
		"مش",
		"ما",
		"لا",
		"ولا",
		"ليس",
		"ليست",
		"ما فيه",
		"مافيه",
		"ما في",
		"مافي",
		"بدون",
	}

	for _, prefix := range negationPrefixes {
		if containsPolicyPhrase(normalized, prefix+" "+normalizedPhrase) {
			return true
		}
	}

	return false
}
