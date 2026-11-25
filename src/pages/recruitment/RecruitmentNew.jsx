import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import SectionHeading from '@/components/site/SectionHeading';
import CampaignForm from '@/components/recruitment/CampaignForm';
import { recruitment } from '@/api/recruitment';

export default function RecruitmentNew() {
  const navigate = useNavigate();
  const create = async (form) => {
    const { campaign } = await recruitment('createCampaign', { campaign: form });
    navigate(`/recruitment/${campaign.id}`);
  };
  return (
    <div className="min-h-screen bg-[#05070a] text-white">
      <Nav />
      <main className="relative pb-20 pt-28 sm:pb-28">
        <div className="relative mx-auto w-full max-w-4xl space-y-6 px-5 sm:px-8">
          <Link to="/recruitment" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> All campaigns
          </Link>
          <SectionHeading
            eyebrow="New recruitment campaign"
            title="Who do you"
            highlight="need?"
            description="Describe the role and the budget you approve. The agent evaluates candidates against these requirements and negotiates only inside your limits."
          />
          <CampaignForm submitLabel="Create campaign" onSubmit={create} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
