"""Contextual, auditable chain candidates; kinship is not narrator verification."""
import re

from .isnad_matn_splitter import split_isnad_matn
from .itqan_sources import load_map
from .shamela_parser import plain_offsets


def name_key(text: str) -> str:
    plain, _ = plain_offsets(text)
    plain = plain.translate(str.maketrans({'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي'}))
    plain = re.sub(r'رض[يى] الله عنه[ما]*|رحمه الله|عليه السلام', '', plain)
    plain = re.sub(r'[^\u0621-\u063a\u0641-\u064a\u0629\s]', ' ', plain)
    return re.sub(r'\s+', ' ', plain).strip()


class IsnadParser:
    def __init__(self, root):
        self.maps = {kin: {name_key(k): v for k, v in load_map(root, f'isnad_{filename}_map').items()} for kin, filename in [('ابيه', 'father'), ('جده', 'grandfather'), ('امه', 'mother'), ('جدته', 'grandmother'), ('عمه', 'uncle')]}
        self.kunya = {name_key(k): v['real'] if isinstance(v, dict) else v for k, v in load_map(root, 'isnad_kunya_map').items()}

    def contextual(self, mention: str, previous: str) -> tuple[str, str]:
        key, prior = name_key(mention), name_key(previous)
        if key in self.maps:
            candidates = [(k, v) for k, v in self.maps[key].items() if prior == k or prior.startswith(k + ' ')]
            if candidates:
                _, value = max(candidates, key=lambda item: len(item[0]))
                return value, {'ابيه': 'father_map', 'جده': 'grandfather_map', 'امه': 'mother_map', 'جدته': 'grandmother_map', 'عمه': 'uncle_map'}[key]
            return mention, 'unresolved_kinship'
        if key in self.kunya:
            return self.kunya[key], 'kunya_map'
        return mention, 'surface'

    def parse(self, text: str, resolver=None) -> list[dict]:
        if not text.strip():
            return []
        plain, offsets = plain_offsets(text)
        view = plain.translate(str.maketrans({'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا'}))
        # Keep offsets back to original strings, including all diacritics.
        cuts = [0] + [m.start() for m in re.finditer(r'(?<!\w)ح\s+و?(?:حدثنا|اخبرنا)\b', view)] + [len(view)]
        nodes = []
        verbs = r'(?<!\w)(?:و?حدثنا|و?حدثني|و?حدثه|و?ثنا|و?ثني|و?اخبرنا|و?اخبرني|و?انبانا|و?انبا|و?سمعت|و?سمعنا|و?روي|عن|قال)\s*[:：]?\s+'
        for path, (start, stop) in enumerate(zip(cuts, cuts[1:])):
            fragment = view[start:stop]
            matches = list(re.finditer(verbs, fragment))
            segments = []
            for index, match in enumerate(matches):
                begin = start + match.end()
                end = start + (matches[index+1].start() if index+1 < len(matches) else len(fragment))
                if begin >= len(offsets):
                    continue
                raw = text[offsets[begin]: offsets[end] if end < len(offsets) else len(text)].strip(' ،,:؛\n\r\t"«»')
                raw = re.split(r'\s+(?:يعني|وهو|انه|أنه|انها|أنها)\s+', raw, maxsplit=1)[0]
                key = name_key(raw)
                if not key or key in {'ح', 'ان', 'انه'} or 'رسول الله' in key or key.startswith('النبي'):
                    continue
                if len(key.split()) > 14:
                    # Long prose isn't silently treated as a verified narrator.
                    continue
                segments.append(raw)
            merged = []
            i = 0
            while i < len(segments):
                value = segments[i]
                if name_key(value) == 'ابي' and i + 1 < len(segments):
                    joined = value + ' ' + segments[i+1]
                    if name_key(joined) in self.kunya:
                        value = joined
                        i += 1
                merged.append(value)
                i += 1
            previous = ''
            for position, surface in enumerate(merged):
                resolved, method = self.contextual(surface, previous)
                next_name = merged[position+1] if position+1 < len(merged) else ''
                match = resolver(resolved, previous, next_name) if resolver else {}
                resolved = match.get('resolved_name') or resolved
                node = {'pos': len(nodes)+1, 'path': path, 'path_pos': position+1, 'surface': surface, 'resolved_name': resolved, 'rijal_id': None, 'grade_ar': '', 'grade_tier': 'Ungraded', 'death_ah': None, 'method': method, **match}
                if method not in ('surface', 'unresolved_kinship'):
                    node['method'] = method + '+' + match.get('method', 'unmatched')
                nodes.append(node)
                previous = resolved
        return nodes
