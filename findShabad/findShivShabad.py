import shabads

total=0
for i in shabads.All_Dasam_Shabads:
    shabad=shabads.All_Dasam_Shabads[i]
    if 'ਦੋਹਰਾ' in  shabad:
        if 'ਨਾਰਿ' in shabad:
            hasEnglish=False
            for ch in "abcdefghijklmnopqrswxyzABCDEFGHIJKLMNOPQRSWXYZ":
                if ch in shabad:
                    hasEnglish=True
                    break
            if not hasEnglish:
                print(i)
                print(shabad)
                total+=1
                # print(i)
                # print(shabads.All_Dasam_Shabads[i])
print(total)

