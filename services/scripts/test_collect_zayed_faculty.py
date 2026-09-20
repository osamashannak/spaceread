"""Offline extraction fixtures for the public ZU directory's HTML variants."""
import unittest

from collect_zayed_faculty import (
    BASE, COLLEGES, canonical_url, extract_profile, merge_faculty, parse_directory, parse_contact_directory,
)


# Reduced, synthetic versions of the live CMS markup; no network or DB needed.
DIRECTORY = '''
<html><body><a href="_auh/unrelated/index.aspx">Outside content</a>
<div id="readable"><h1>Faculty and Staff</h1>
<h3 class="en-static-heading">Administrators</h3>
<h3 class="ar-static-heading">المسؤولين</h3>
<div class="media-body"><a class="inside-media-body inside-media-admin" href="_profiles/Dean.aspx">
<p class="design">Dean</p><h4 class="media-heading">Prof. Sam Example</h4><p>Professor</p></a></div>
<h3 class="en-static-heading">Administrative and Technical Staff</h3>
<a class="inside-media-body" href="_profiles/Staff.aspx"><h4 class="media-heading">Taylor Staff</h4><p>Technician</p></a>
<h3 class="en-static-heading">Faculty</h3><h4>Dubai</h4>
<a class="inside-media-body" href="&#10; _profiles/Faculty.aspx &#10;"><h4 class="media-heading">Alex_Faculty</h4><p>Instructor</p></a>
<h3 class="en-static-heading">Adjunct Faculty</h3>
<a class="inside-media-body" href="_profiles/Adjunct.aspx"><h4 class="media-heading">Robin Adjunct</h4><p>Instructor</p></a>
<a href="_dxb/_computing-and-applied-technology/index.aspx">Computing</a>
<a href="_auh/_computing-and-applied-technology/index.aspx">Computing</a>
<a href="_profiles/index.aspx">Stale profile folder</a>
<a href="_links/index.aspx">Stale copied directory</a>
<a href="https://external.example/index">External link</a>
</div></body></html>
'''

PROFILE = '''
<html><head><title>Dr. Alex Faculty | Zayed University</title></head>
<body><a href="mailto:webmaster@zu.ac.ae">Outside content</a>
<div id="readable"><h6>Email:</h6>
<a class="email" href="&#10; mailto:&#10; Alex.Faculty@zu.ac.ae">Contact Me</a>
<h6>Research</h6><p>Coauthored with somebody.else@zu.ac.ae</p>
</div></body></html>
'''


class DirectoryTests(unittest.TestCase):
    def setUp(self):
        self.college = 'College of Technological Innovation'
        self.url = BASE + COLLEGES[self.college]

    def test_both_campuses_active_directories_only(self):
        _, _, children = parse_directory(DIRECTORY, self.url, self.college)
        self.assertEqual(children, [
            self.url.rsplit('/', 1)[0] + '/_auh/_computing-and-applied-technology/index',
            self.url.rsplit('/', 1)[0] + '/_dxb/_computing-and-applied-technology/index',
        ])

    def test_academic_admin_instructors_adjuncts_and_staff(self):
        faculty, staff, _ = parse_directory(DIRECTORY, self.url, self.college)
        self.assertEqual([person['name'] for person in faculty], ['Sam Example', 'Alex Faculty', 'Robin Adjunct'])
        self.assertEqual([person['name'] for person in staff], ['Taylor Staff'])
        self.assertEqual(faculty[-1]['section'], 'Adjunct Faculty')
        self.assertEqual(faculty[1]['profile_url'], self.url.rsplit('/', 1)[0] + '/_profiles/faculty')

    def test_non_teaching_officer_under_administrators_is_excluded(self):
        markup = '<html><div id="readable"><h3>Administrators</h3><a class="inside-media-body" href="_profiles/Staff.aspx"><p class="design">Senior Academic Administrative Officer</p><h4 class="media-heading">Sam Officer</h4><p>Administrative Officer</p></a></div></html>'
        faculty, staff, _ = parse_directory(markup, self.url, self.college)
        self.assertEqual(faculty, [])
        self.assertEqual(staff[0]['name'], 'Sam Officer')

    def test_legacy_url_case_and_extension(self):
        self.assertEqual(canonical_url('http://www.zu.ac.ae/MAIN/Faculty.aspx?x=1#top'), 'https://www.zu.ac.ae/main/faculty')
        with self.assertRaises(ValueError):
            canonical_url('https://other.example/faculty')


class ProfileTests(unittest.TestCase):
    def test_mailto_contact_me_and_label_ignore_other_emails(self):
        self.assertEqual(extract_profile(PROFILE), (['alex.faculty@zu.ac.ae'], 'Alex Faculty'))

    def test_plain_text_label(self):
        markup = '<html><title>Sam Example</title><div id="readable"><h6>Email:</h6><p>SAM.EXAMPLE@ZU.AC.AE</p><h6>Research</h6></div></html>'
        self.assertEqual(extract_profile(markup), (['sam.example@zu.ac.ae'], 'Sam Example'))

    def test_missing_is_not_invented_from_name(self):
        self.assertEqual(extract_profile('<html><title>Sam Example</title><div id="readable">Email: not listed</div></html>')[0], [])

    def test_two_published_addresses_are_ambiguous(self):
        markup = '<html><div id="readable"><a class="email" href="mailto:first@zu.ac.ae">first@zu.ac.ae</a><a class="email" href="mailto:second@zu.ac.ae">second@zu.ac.ae</a></div></html>'
        self.assertEqual(extract_profile(markup)[0], ['first@zu.ac.ae', 'second@zu.ac.ae'])

    def test_non_university_email_is_not_imported(self):
        self.assertEqual(extract_profile('<html><div id="readable"><a class="email" href="mailto:sam@gmail.com">sam@gmail.com</a></div></html>')[0], [])


    def test_visible_email_overrides_copied_mailto(self):
        markup = '<html><div id="readable"><p><strong>Email</strong></p><p><a href="mailto:wrong@zu.ac.ae">Hil</a><a href="mailto:ke.steenkamp@zu.ac.ae">ke.Steenkamp@zu.ac.ae</a></p></div></html>'
        self.assertEqual(extract_profile(markup)[0], ['hilke.steenkamp@zu.ac.ae'])

    def test_whitespace_around_at_sign_is_formatting(self):
        markup = '<html><div id="readable"><a class="email" href="mailto:Sam.Example @zu.ac.ae">Sam.Example @zu.ac.ae</a></div></html>'
        self.assertEqual(extract_profile(markup)[0], ['sam.example@zu.ac.ae'])

    def test_contact_form_is_not_an_email(self):
        markup = '<html><div id="readable"><label>Email:</label><a class="email" href="/contact-faculty?userid=123">Contact Me</a><h6>Research</h6><p>Coauthor: other@zu.ac.ae</p></div></html>'
        self.assertEqual(extract_profile(markup)[0], [])

    def test_contact_table_matches_name_and_published_mailto(self):
        markup = '<html><div id="readable"><table><tr><td>Sam Example</td><td><a href="mailto:Sam.Example@zu.ac.ae">Contact Me</a></td></tr><tr><td>Robin Example</td><td><a href="/contact?userid=123">Contact Me</a></td></tr></table></div></html>'
        self.assertEqual(parse_contact_directory(markup), [{'name': 'Sam Example', 'email': 'sam.example@zu.ac.ae'}])


class MergeTests(unittest.TestCase):
    def test_email_identity_unions_cross_college_and_campus_sources(self):
        rows = [
            {'name': 'Sam Example', 'email': 'Sam.Example@zu.ac.ae', 'colleges': ['Business'], 'source_urls': ['https://www.zu.ac.ae/dxb/profile']},
            {'name': 'Sam Example', 'email': 'sam.example@zu.ac.ae', 'colleges': ['Interdisciplinary Studies'], 'source_urls': ['https://www.zu.ac.ae/auh/profile']},
        ]
        result = merge_faculty(rows)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['email'], 'sam.example@zu.ac.ae')
        self.assertEqual(result[0]['colleges'], ['Business', 'Interdisciplinary Studies'])
        self.assertEqual(len(result[0]['source_urls']), 2)

    def test_unrelated_people_cannot_share_a_copied_email(self):
        rows = [{'name': name, 'email': 'wrong@zu.ac.ae', 'colleges': ['Business'], 'source_urls': ['https://www.zu.ac.ae/profile']} for name in ('Ahmed Example', 'Ahmed Other')]
        with self.assertRaisesRegex(ValueError, 'Conflicting identities'):
            merge_faculty(rows)

    def test_spelling_and_middle_name_variants_merge(self):
        for names in [('Ileana Baird', 'Ilena Baird'), ('Amjad Talafheh', 'Amjad Talfheh'), ('Nayel AlOmran', 'Nayel Omran'), ('Abiot Tessema', 'Abiot Mindaye Tessema')]:
            rows = [{'name': name, 'email': 'faculty@zu.ac.ae', 'colleges': ['Business'], 'source_urls': ['https://www.zu.ac.ae/profile']} for name in names]
            self.assertEqual(len(merge_faculty(rows)), 1)

    def test_same_name_different_emails_remain_separate(self):
        rows = [{'name': 'Sam Example', 'email': email, 'colleges': ['Business'], 'source_urls': ['https://www.zu.ac.ae/profile']} for email in ('sam.one@zu.ac.ae', 'sam.two@zu.ac.ae')]
        self.assertEqual(len(merge_faculty(rows)), 2)


if __name__ == '__main__':
    unittest.main()
