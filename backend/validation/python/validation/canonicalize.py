from __future__ import annotations
import json, math
from typing import Any

CANONICALIZATION_ID='oneshot-jcs-rfc8785-v1'
MAX_SAFE_INTEGER=9007199254740991

def _reject_surrogates(s: str):
    for ch in s:
        if 0xD800 <= ord(ch) <= 0xDFFF:
            raise ValueError('RFC 8785/I-JSON does not accept lone surrogate code points')

def _string(s: str) -> str:
    _reject_surrogates(s)
    return json.dumps(s, ensure_ascii=False, separators=(',',':'))

def _number(v: int | float) -> str:
    if isinstance(v,bool): raise TypeError('bool is not a number here')
    if isinstance(v,int):
        if abs(v)>MAX_SAFE_INTEGER: raise ValueError('integer exceeds I-JSON safe integer range')
        return str(v)
    if not math.isfinite(v): raise ValueError('non-finite JSON number')
    if v==0: return '0'
    neg=v<0
    s=repr(abs(v)).lower()
    if 'e' in s:
        mant, exps=s.split('e'); exp=int(exps)
    else:
        mant=s; exp=0
    if '.' in mant:
        whole, frac=mant.split('.'); digits=whole+frac; exp10=exp-len(frac)
    else:
        digits=mant; exp10=exp
    digits=digits.lstrip('0') or '0'
    while len(digits)>1 and digits.endswith('0'):
        digits=digits[:-1]; exp10+=1
    decimal_pos=len(digits)+exp10
    av=abs(v)
    if 1e-6 <= av < 1e21:
        if decimal_pos<=0: out='0.'+'0'*(-decimal_pos)+digits
        elif decimal_pos>=len(digits): out=digits+'0'*(decimal_pos-len(digits))
        else: out=digits[:decimal_pos]+'.'+digits[decimal_pos:]
    else:
        exponent=decimal_pos-1
        coeff=digits[0] + ('.'+digits[1:] if len(digits)>1 else '')
        out=coeff+'e'+('+' if exponent>=0 else '')+str(exponent)
    return ('-' if neg else '')+out

def canonicalize(value: Any) -> bytes:
    def ser(v):
        if v is None: return 'null'
        if v is True: return 'true'
        if v is False: return 'false'
        if isinstance(v,(int,float)): return _number(v)
        if isinstance(v,str): return _string(v)
        if isinstance(v,list): return '['+','.join(ser(x) for x in v)+']'
        if isinstance(v,dict):
            for k in v:
                if not isinstance(k,str): raise TypeError('JSON object keys must be strings')
                _reject_surrogates(k)
            keys=sorted(v.keys(), key=lambda x:x.encode('utf-16-be'))
            return '{'+','.join(_string(k)+':'+ser(v[k]) for k in keys)+'}'
        raise TypeError(f'unsupported JSON type: {type(v).__name__}')
    return ser(value).encode('utf-8')
