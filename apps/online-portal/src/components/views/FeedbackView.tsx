import React from 'react';
import { Star } from 'lucide-react';
import { Toast } from '@omni/shared-ui';
import FeedbackForm from '../ui/FeedbackForm';

interface FeedbackViewProps {
  toast: { message: string; type: 'error' | 'success' } | null;
  setToast: (toast: { message: string; type: 'error' | 'success' } | null) => void;
  submitFeedback: (rating: number, comment: string) => void;
}

const FeedbackView: React.FC<FeedbackViewProps> = ({
  toast, setToast, submitFeedback
}) => {
  return (
    <div className="max-w-md w-full bg-white p-6 sm:p-8 rounded-3xl shadow-2xl text-center space-y-6 animate-in slide-in-from-bottom duration-500">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="bg-yellow-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto text-yellow-500">
        <Star size={40} fill="currentColor" />
      </div>
      <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Service Completed!</h2>
      <p className="text-gray-500 text-sm">How was your experience with Omni-Queue 360?</p>
      <FeedbackForm onSubmit={submitFeedback} />
    </div>
  );
};

export default FeedbackView;
