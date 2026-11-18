export const postcardPermission=invite=>invite.paperlessId?'paperless':invite.allow_print?'mail':'off';
export function filterInvitations(invitations,contacts,{query='',mugs='all',postcards='all'}={}){
 const q=query.trim().toLocaleLowerCase(),names=new Map(contacts.map(person=>[person.id,person.name]));
 return invitations.filter(invite=>{
  const matchesText=[invite.addressedTo,invite.name,invite.phone,...(invite.memberIds||[]).map(id=>names.get(id)||'')].join(' ').toLocaleLowerCase().includes(q);
  return matchesText&&(mugs==='all'||Boolean(invite.allow_mug)===(mugs==='on'))&&(postcards==='all'||postcardPermission(invite)===postcards);
 });
}
