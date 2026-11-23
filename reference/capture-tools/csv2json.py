import csv, glob, json, re
csv.field_size_limit(10**9)
U='/mnt/user-data/uploads/'
out={}
num=re.compile(r'^-?\d+(\.\d+)?$')
for n in ['Agent','AgentTask','AgentUpload','AuditLog','Inquiry','Organization','OrganizationMember','ResearchReport','UsageRecord']:
    f=glob.glob(U+'*-'+n+'_export.csv')[0]
    t=open(f,encoding='utf-8').read()
    rows=list(csv.DictReader(t.splitlines(True))) if t.strip() else []
    conv=[]
    for r in rows:
        d={}
        for k,v in r.items():
            if v=='' : d[k]=None
            elif v in('true','false'): d[k]= v=='true'
            elif v[:1] in '[{':
                try: d[k]=json.loads(v)
                except Exception: d[k]=v
            elif num.match(v) and k not in('id','reference'): d[k]=float(v) if '.' in v else int(v)
            else: d[k]=v
        conv.append(d)
    out[n]=conv
json.dump(out,open('/home/claude/scripts/data.json','w'))
print({k:len(v) for k,v in out.items()})
